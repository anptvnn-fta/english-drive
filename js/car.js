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
      el.textContent = w.w;
      // từ/cụm dài thì co chữ lại để không bị ngắt giữa chữ
      el.classList.toggle("long", w.w.length > 10 && w.w.length <= 16);
      el.classList.toggle("vlong", w.w.length > 16);
      this.el("wIpa").textContent = "/" + w.i + "/";
      this.el("wVi").textContent = w.v;
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

  async speakPair(w, t, rate) {
    await TTS.speak(w.w, "en-US", rate ?? this.s().rate);
    if (!this.ok(t)) return;
    await sleep(500);
    if (!this.ok(t)) return;
    await TTS.speak(w.v.split(";")[0], "vi-VN", 1);
  },

  /* Học 1 từ: lặp reps lần, cách nhau gap giây */
  async playWord(w, t) {
    const reps = this.s().reps;
    for (this.rep = 0; this.rep < reps; this.rep++) {
      if (!this.ok(t)) return false;
      this.render();
      await this.speakPair(w, t);
      if (!this.ok(t)) return false;
      if (this.rep < reps - 1) await sleep(this.s().gap * 1000);
    }
    await sleep(1200);
    return this.ok(t);
  },

  /* Ôn 1 từ: đọc 1 lần rồi nghỉ ngắn */
  async playOnce(w, t, pauseMs) {
    this.render();
    await this.speakPair(w, t);
    if (!this.ok(t)) return false;
    await sleep(pauseMs);
    return this.ok(t);
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
        if (!await this.playOnce(this.batch[this.wi], t, 2200)) return;
        this.wi++;
      } else if (this.phase === "mega") {
        if (this.wi >= this.mega.length) { this.startNewBatch(); continue; }
        if (!await this.playOnce(this.mega[this.wi], t, 2000)) return;
        this.wi++;
      } else if (this.phase === "passive") {
        if (!this.passive.length) { this.pause(); return; }
        if (this.wi >= this.passive.length) {
          this.passive = shuffle(this.passive);
          this.wi = 0;
        }
        const pw = this.passive[this.wi];
        if (!await this.playOnce(pw, t, 2500)) return;
        if (!this.seenSet.has(pw.w)) { // nghe thụ động cũng dời hạn ôn, 1 lần/phiên
          this.seenSet.add(pw.w);
          SRS.carSeen(pw.w);
        }
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
    if (this.playing) {
      // đang phát: đọc lại từ này từ đầu (không đếm trùng nhờ seenSet)
      this.rep = 0;
      this.render();
      this.loop();
    } else {
      // đang dừng: chỉ đọc 1 lần, không đụng vào trạng thái phát
      const t = this.token;
      TTS.speak(w.w, "en-US", this.s().rate).then(() => {
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
    reps.value = s.reps; gap.value = s.gap; rate.value = s.rate;
    const out = () => {
      this.el("repsOut").textContent = reps.value;
      this.el("gapOut").textContent = gap.value;
      this.el("rateOut").textContent = Number(rate.value).toFixed(2) + "×";
    };
    out();
    const apply = () => {
      s.reps = +reps.value; s.gap = +gap.value; s.rate = +rate.value;
      Store.data.settingsAt = Date.now();
      Store.save(); out(); this.render();
    };
    reps.oninput = apply; gap.oninput = apply; rate.oninput = apply;
    this.el("btnTestEn").onclick = () => TTS.speak("analysis", "en-US", s.rate);
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
    this.el("btnDrawer").onclick = () => openDrawer(true);
    this.el("btnDrawerClose").onclick = () => openDrawer(false);
    this.el("btnDrawerX").onclick = () => openDrawer(false);
    this.el("drawerBackdrop").onclick = () => openDrawer(false);

    this.el("btnStart").onclick = () => {
      this.el("startOverlay").classList.add("hidden");
      // yêu cầu toàn màn hình trên màn hình xe (bỏ qua nếu bị chặn)
      try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch {}
      this.play();
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.playing) {
        this.requestWake();
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
