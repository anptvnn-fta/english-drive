/* ============================================================
   Chế độ TRÊN XE: phát liên tục theo lộ trình.
   - Mỗi lô 5 từ: ưu tiên từ đến hạn ôn, thiếu thì lấy từ mới.
   - Mỗi từ: đọc EN → nghĩa VI, lặp reps lần, cách nhau gap giây.
   - Hết lô: ôn nhanh 5 từ. Hết 5 lô: ôn tập lớn 25 từ.
   - Hết toàn bộ từ: nghe lại thụ động (phát vòng từ đã học).
   ============================================================ */

const Car = {
  phase: "idle",       // learn | review | mega | passive
  batch: [], wi: 0, rep: 0,
  batchNo: 0,          // số lô đã xong (để tính ôn tập lớn)
  cycle: [],           // từ của các lô gần nhất (nguồn cho ôn tập lớn)
  mega: [], passive: [],
  sessionWords: [],    // mọi từ đã phát trong phiên
  seenSet: new Set(),  // chống đếm trùng khi replay/quay lại
  playing: false,
  token: 0,
  wakeLock: null,
  countNew: 0, countReview: 0,

  el(id) { return document.getElementById(id); },

  s() { return Store.data.settings; },

  ok(t) { return this.playing && t === this.token; },

  currentList() {
    if (this.phase === "mega") return this.mega;
    if (this.phase === "passive") return this.passive;
    return this.batch;
  },
  currentWord() {
    const list = this.currentList();
    return list[Math.min(this.wi, list.length - 1)] || null;
  },

  nextBatch() {
    const inSession = new Set(this.sessionWords.map(x => x.w));
    const due = SRS.dueWords().filter(x => !inSession.has(x.w));
    const batch = due.slice(0, UNIT_SIZE);
    if (batch.length < UNIT_SIZE) {
      const news = SRS.newWords(UNIT_SIZE - batch.length + 5)
        .filter(x => !inSession.has(x.w) && !batch.some(b => b.w === x.w))
        .slice(0, UNIT_SIZE - batch.length);
      batch.push(...news);
    }
    return batch;
  },

  render() {
    const w = this.currentWord();
    if (w) {
      const el = this.el("wWord");
      // fade nhẹ khi CHUYỂN sang từ mới (không fade mỗi lần lặp)
      if (w.w !== this._lastWord) {
        this._lastWord = w.w;
        const stage = this.el("stage");
        stage.classList.remove("word-in");
        void stage.offsetWidth;
        stage.classList.add("word-in");
      }
      el.textContent = w.w;
      // từ/cụm dài thì co chữ lại để không bị ngắt giữa chữ
      el.classList.toggle("long", w.w.length > 10 && w.w.length <= 16);
      el.classList.toggle("vlong", w.w.length > 16);
      this.el("wIpa").textContent = "/" + w.i + "/";
      this.el("wVi").textContent = w.v;
      renderIllust(this.el("carIllust"), w, "car-illust"); // hình nhỏ góc phải, không che chữ
    }
    const pill = this.el("phasePill");
    const names = { learn: "HỌC TỪ", review: "ÔN LÔ NÀY", mega: "ÔN TẬP LỚN", passive: "NGHE THỤ ĐỘNG", idle: "TẠM DỪNG" };
    pill.textContent = names[this.phase] || "";
    pill.className = "phase " + (this.phase === "learn" ? "learn" : "review");

    const dots = this.el("dots");
    if (this.phase === "learn") {
      dots.innerHTML = Array.from({ length: this.s().reps },
        (_, i) => `<i class="${i <= this.rep ? "on" : ""}"></i>`).join("");
    } else dots.innerHTML = "";

    this.el("todayInfo").textContent =
      `mới ${this.countNew} · ôn ${this.countReview}` +
      (this.phase === "learn" || this.phase === "review" ? ` · lô ${this.batchNo + 1}, từ ${Math.min(this.wi + 1, this.batch.length)}/${this.batch.length}` : "");

    const total = VOCAB.length || 1;
    const learned = SRS.learnedWords().length;
    this.el("progressBar").style.width = (learned / total * 100).toFixed(1) + "%";
  },

  async speakPair(w, t, voiceIdx = 0) {
    await TTS.speak(w.w, "en-US", this.s().rate, TTS.enVoiceFor(voiceIdx));
    if (!this.ok(t)) return;
    await sleep(500);
    if (!this.ok(t)) return;
    await TTS.speak(w.v.split(";")[0], "vi-VN", 1);
  },

  /* Nghỉ giữa các lần lặp, đồng thời chạy thanh đếm ngược tới lần đọc kế */
  async gapCountdown(ms, t) {
    const bar = this.el("gapBar");
    if (bar) {
      bar.style.transition = "none";
      bar.style.transform = "scaleX(1)";
      // ép trình duyệt vẽ lại rồi mới bật transition co về 0
      void bar.offsetWidth;
      bar.style.transition = `transform ${ms}ms linear`;
      bar.style.transform = "scaleX(0)";
    }
    await sleep(ms);
    if (bar) { bar.style.transition = "none"; bar.style.transform = "scaleX(0)"; }
    return this.ok(t);
  },

  /* Học 1 từ: lặp reps lần, cách nhau gap giây — mỗi lượt một giọng nếu bật trộn giọng */
  async playWord(w, t) {
    const reps = this.s().reps;
    for (this.rep = 0; this.rep < reps; this.rep++) {
      if (!this.ok(t)) return false;
      this.render();
      await this.speakPair(w, t, this.rep);
      if (!this.ok(t)) return false;
      if (this.rep < reps - 1) { if (!await this.gapCountdown(this.s().gap * 1000, t)) return false; }
    }
    await sleep(1200);
    return this.ok(t);
  },

  /* Ôn 1 từ: đọc 1 lần rồi nghỉ ngắn */
  async playOnce(w, t, pauseMs, voiceIdx = 0) {
    this.render();
    await this.speakPair(w, t, voiceIdx);
    if (!this.ok(t)) return false;
    await sleep(pauseMs);
    return this.ok(t);
  },

  /* ---------- Chế độ đọc theo (shadow) ---------- */
  ding(good) {
    try {
      const ctx = this._actx || (this._actx = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === "suspended") ctx.resume();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = good ? 880 : 240;
      if (good) o.frequency.setValueAtTime(1320, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.start(); o.stop(ctx.currentTime + 0.4);
    } catch {}
  },

  listenOnce(maxMs) {
    return new Promise(resolve => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return resolve(null);
      let done = false, rec = null, timer = null;
      const fin = v => {
        if (done) return;
        done = true; clearTimeout(timer);
        try { rec && rec.abort(); } catch {}
        if (this._activeRec === rec) this._activeRec = null;
        resolve(v);
      };
      try {
        rec = new SR();
        rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 5;
        rec.onresult = e => fin([...e.results[0]].map(r => r.transcript));
        rec.onerror = e => fin(e.error === "not-allowed" ? "denied" : null);
        rec.onend = () => fin(null);
        rec.start();
        this._activeRec = rec; // để visibilitychange hủy mic đang treo
      } catch { return fin(null); }
      timer = setTimeout(() => fin(null), maxMs);
    });
  },

  /* Mời đọc theo: đúng → ding + đi tiếp sớm; sai/không nghe được → vẫn đi tiếp, không phạt */
  async shadowGate(w, t) {
    const hint = this.el("shadowHint");
    hint.classList.remove("hidden", "good");
    hint.textContent = "🎙 Đọc theo nhé…";
    const alts = await this.listenOnce(4000);
    if (!this.ok(t)) { hint.classList.add("hidden"); return; }
    if (alts === "denied") {
      this.s().shadow = false;
      this.el("setShadow").checked = false; // đồng bộ lại checkbox trong drawer
      Store.data.settingsAt = Date.now();
      Store.save();
      hint.textContent = "Mic bị chặn — đã tắt chế độ đọc theo";
      await sleep(1800);
      hint.classList.add("hidden");
      return;
    }
    let pass = false, heard = "";
    if (Array.isArray(alts)) {
      for (const a of alts) {
        const norm = a.toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim();
        heard = heard || a;
        if (norm === w.w || norm.includes(w.w) || norm.split(" ").includes(w.w) || similarity(norm, w.w) >= 0.72) {
          pass = true; break;
        }
      }
    }
    if (pass) {
      const st = Store.st(w.w); st.ok++; Store.save();
      this.ding(true);
      hint.classList.add("good");
      hint.textContent = "✓ Chuẩn rồi!";
      await sleep(900);
    } else if (Array.isArray(alts)) {
      hint.textContent = `Web nghe thành “${heard.slice(0, 26)}” — không sao, đi tiếp`;
      await sleep(1400);
    }
    hint.classList.add("hidden");
  },

  startNewBatch() {
    this.batch = this.nextBatch();
    this.wi = 0; this.rep = 0;
    if (!this.batch.length) {
      this.phase = "passive";
      this.passive = shuffle(this.sessionWords.length ? this.sessionWords : SRS.learnedWords());
      if (!this.passive.length) this.passive = VOCAB.slice(0, 20);
      if (!this.passive.length) { this.phase = "idle"; this.pause(); return; } // không có dữ liệu
    } else {
      this.phase = "learn";
    }
  },

  async loop() {
    const t = ++this.token;
    while (this.ok(t)) {
      if (this.phase === "learn") {
        if (this.wi >= this.batch.length) { this.phase = "review"; this.wi = 0; continue; }
        const w = this.batch[this.wi];
        const wasNew = Store.st(w.w).box === 0;
        const done = await this.playWord(w, t);
        if (!done) return;
        if (!this.seenSet.has(w.w)) { // replay/quay lại không đếm trùng
          this.seenSet.add(w.w);
          SRS.carSeen(w.w);
          if (wasNew) this.countNew++; else this.countReview++;
          this.sessionWords.push(w);
        }
        if (this.s().shadow) {
          await this.shadowGate(w, t);
          if (!this.ok(t)) return;
        }
        this.wi++;
      } else if (this.phase === "review") {
        if (this.wi >= this.batch.length) {
          this.cycle.push(...this.batch);
          this.batchNo++;
          if (this.batchNo % 5 === 0 && this.cycle.length) {
            this.phase = "mega";
            this.mega = shuffle(this.cycle.slice(-UNIT_SIZE * 5));
            this.wi = 0;
          } else {
            this.startNewBatch();
          }
          continue;
        }
        if (!await this.playOnce(this.batch[this.wi], t, 2200, this.wi)) return;
        if (this.s().shadow) { await this.shadowGate(this.batch[this.wi], t); if (!this.ok(t)) return; }
        this.wi++;
      } else if (this.phase === "mega") {
        if (this.wi >= this.mega.length) { this.startNewBatch(); continue; }
        if (!await this.playOnce(this.mega[this.wi], t, 2000, this.wi)) return;
        if (this.s().shadow) { await this.shadowGate(this.mega[this.wi], t); if (!this.ok(t)) return; }
        this.wi++;
      } else if (this.phase === "passive") {
        if (!this.passive.length) { this.pause(); return; }
        if (this.wi >= this.passive.length) {
          this.passive = shuffle(this.passive);
          this.wi = 0;
        }
        const pw = this.passive[this.wi];
        if (!await this.playOnce(pw, t, 2500, this.wi)) return;
        if (!this.seenSet.has(pw.w)) { // nghe thụ động cũng dời hạn ôn, 1 lần/phiên
          this.seenSet.add(pw.w);
          SRS.carSeen(pw.w);
        }
        if (this.s().shadow) { await this.shadowGate(pw, t); if (!this.ok(t)) return; }
        this.wi++;
      } else return;
    }
  },

  play() {
    if (this.playing) return;
    this.playing = true;
    if (this.phase === "idle") this.startNewBatch();
    this.el("btnPlay").textContent = "⏸";
    this.render();
    this.requestWake();
    this.loop();
  },

  pause() {
    this.playing = false;
    this.token++;
    TTS.stop();
    this.el("btnPlay").textContent = "▶";
    this.el("phasePill").textContent = "TẠM DỪNG";
  },

  toggle() { this.playing ? this.pause() : this.play(); },

  /* Chuyển từ: nhảy trong danh sách hiện tại rồi phát tiếp */
  jump(delta) {
    const list = this.currentList();
    if (!list.length) return;
    this.token++; TTS.stop();
    if (this._activeRec) { try { this._activeRec.abort(); } catch {} this._activeRec = null; }
    this.wi = Math.max(0, Math.min(list.length - 1, this.wi + delta));
    this.rep = 0;
    if (this.playing) { this.playing = true; this.render(); this.loop(); }
    else this.render();
  },

  /* Chạm vào chữ: đọc lại từ đang hiện */
  replay() {
    const w = this.currentWord();
    if (!w) return;
    this.token++; TTS.stop();
    if (this._activeRec) { try { this._activeRec.abort(); } catch {} this._activeRec = null; }
    if (this.playing) {
      // đang phát: đọc lại từ này từ đầu (không đếm trùng nhờ seenSet)
      this.rep = 0;
      this.render();
      this.loop();
    } else {
      // đang dừng: chỉ đọc 1 lần, không đụng vào trạng thái phát
      const t = this.token;
      TTS.speak(w.w, "en-US", this.s().rate, TTS.enVoiceFor(0)).then(() => {
        if (t !== this.token) return;
        return sleep(450).then(() => {
          if (t === this.token) TTS.speak(w.v.split(";")[0], "vi-VN", 1);
        });
      });
    }
  },

  async requestWake() {
    try {
      if ("wakeLock" in navigator) {
        this.wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch {}
  },

  bindSettings() {
    const s = this.s();
    const reps = this.el("setReps"), gap = this.el("setGap"), rate = this.el("setRate");
    const vmode = this.el("setVoiceMode"), shadow = this.el("setShadow");
    reps.value = s.reps; gap.value = s.gap; rate.value = s.rate;
    vmode.value = s.voiceMode || "mix"; shadow.checked = !!s.shadow;
    const out = () => {
      this.el("repsOut").textContent = reps.value;
      this.el("gapOut").textContent = gap.value;
      this.el("rateOut").textContent = Number(rate.value).toFixed(2) + "×";
    };
    out();
    const apply = () => {
      s.reps = +reps.value; s.gap = +gap.value; s.rate = +rate.value;
      s.voiceMode = vmode.value; s.shadow = shadow.checked;
      Store.data.settingsAt = Date.now();
      Store.save(); out(); this.render();
    };
    reps.oninput = apply; gap.oninput = apply; rate.oninput = apply;
    vmode.onchange = apply; shadow.onchange = apply;

    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
      shadow.disabled = true;
      this.el("shadowSupport").textContent = "Trình duyệt này không hỗ trợ nhận diện giọng nói.";
    }
    // báo số giọng tiếng Anh khả dụng — cập nhật mỗi lần mở drawer (giọng load muộn trên Android)
    this._updateVoiceCount = () => {
      const n = TTS.enVoices.length;
      this.el("voiceCount").textContent = n
        ? `Máy này có ${n} giọng tiếng Anh: ${TTS.enVoices.map(v => v.lang).join(", ")}`
        : "Đang chờ giọng đọc nạp…";
    };
    setTimeout(this._updateVoiceCount, 1800);

    this.el("btnTestEn").onclick = () => {
      const v = TTS.enVoiceFor(this._testIdx = (this._testIdx || 0) + 1);
      TTS.speak("analysis", "en-US", s.rate, v);
    };
    this.el("btnTestVi").onclick = () => TTS.speak("phân tích", "vi-VN", 1);
  },

  init() {
    this.bindSettings();
    this.el("btnPlay").onclick = () => this.toggle();
    this.el("btnNext").onclick = () => this.jump(1);
    this.el("btnPrev").onclick = () => this.jump(-1);
    this.el("stage").onclick = () => this.replay();
    this.el("btnHome").onclick = () => { this.pause(); location.href = "index.html"; };
    const openDrawer = (on) => {
      this.el("drawer").classList.toggle("open", on);
      this.el("drawerBackdrop").classList.toggle("open", on);
    };
    this.el("btnDrawer").onclick = () => { this._updateVoiceCount?.(); openDrawer(true); };
    this.el("btnDrawerClose").onclick = () => openDrawer(false);
    this.el("btnDrawerX").onclick = () => openDrawer(false);
    this.el("drawerBackdrop").onclick = () => openDrawer(false);

    this.el("btnStart").onclick = () => {
      this.el("startOverlay").classList.add("hidden");
      // tạo AudioContext ngay trong cử chỉ chạm để tiếng ding không bị autoplay policy chặn
      try {
        this._actx = this._actx || new (window.AudioContext || window.webkitAudioContext)();
        this._actx.resume();
      } catch {}
      // yêu cầu toàn màn hình trên màn hình xe (bỏ qua nếu bị chặn)
      try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch {}
      this.play();
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.playing) {
        this.requestWake();
        // hủy mic còn treo từ trước khi tab bị ẩn
        if (this._activeRec) { try { this._activeRec.abort(); } catch {} this._activeRec = null; }
        // khi tab bị ẩn, watchdog có thể đã "đọc chay" — quay lại thì đọc lại từ đang dở
        this.token++; TTS.stop(); this.rep = 0;
        this.render();
        this.loop();
      }
    });

    // cảnh báo nếu thiếu giọng đọc
    setTimeout(() => {
      const warns = [];
      if (!("speechSynthesis" in window)) warns.push("Trình duyệt không hỗ trợ đọc thành tiếng.");
      else {
        if (!TTS.enVoice) warns.push("Chưa thấy giọng tiếng Anh — hãy dùng Chrome.");
        if (!TTS.viVoice) warns.push("Chưa thấy giọng tiếng Việt — nghĩa sẽ chỉ hiển thị, không đọc.");
      }
      this.el("voiceWarn").textContent = warns.join(" ");
    }, 1500);

    const due = SRS.dueWords().length;
    this.el("overlayInfo").innerHTML =
      (due ? `Có <b>${due}</b> từ đến hạn ôn, học trước rồi sang từ mới.` :
        `Bắt đầu với từ mới theo lộ trình.`) +
      `<br>Cứ 5 từ ôn một lượt, 5 lô có bài ôn tập lớn.`;

    this.render();
    SYNC.init(() => this.render());
  },
};

Car.init();
