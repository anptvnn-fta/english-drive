/* Luyện phát âm: nhận diện giọng nói của Chrome, so khớp mờ với từ gốc */

const Speak = {
  queue: [], idx: 0, passed: 0, tried: 0,
  rec: null, listening: false,

  el(id) { return document.getElementById(id); },

  buildQueue() {
    // ưu tiên từ học gần đây (đã gặp), thiếu thì lấy đầu lộ trình
    let pool = SRS.learnedWords();
    if (pool.length < 10) {
      const have = new Set(pool.map(x => x.w));
      pool = pool.concat(VOCAB.filter(x => !have.has(x.w)).slice(0, 10 - pool.length));
    }
    this.queue = shuffle(pool).slice(0, 10);
    this.idx = 0; this.passed = 0; this.tried = 0;
  },

  word() { return this.queue[this.idx]; },

  show() {
    const w = this.word();
    if (!w) return this.finish();
    this.el("sWord").textContent = w.w;
    this.el("sIpa").textContent = "/" + w.i + "/";
    this.el("sVi").textContent = w.v;
    this.el("posNow").textContent = this.idx + 1;
    this.el("posTotal").textContent = this.queue.length;
    this.el("passCount").textContent = this.passed;
    this.el("result").innerHTML = `<div class="muted">Bấm mic rồi đọc từ phía trên</div>`;
    this.el("btnNext").classList.add("hidden");
  },

  judge(alternatives) {
    const w = this.word();
    const target = w.w.toLowerCase();
    let best = 0, heard = alternatives[0] || "";
    for (const alt of alternatives) {
      const a = alt.toLowerCase().replace(/[^a-z' ]/g, "").trim();
      if (!a) continue;
      // chứa nguyên từ → đạt luôn
      if (a.split(" ").includes(target) || a === target) { best = 1; heard = alt; break; }
      const s = similarity(a, target);
      if (s > best) { best = s; heard = alt; }
    }
    this.tried++;
    const res = this.el("result");
    if (best >= 0.8) {
      this.passed++;
      this.el("passCount").textContent = this.passed;
      res.innerHTML = `<div class="verdict good">✓ Chuẩn rồi!</div><div class="heard">Web nghe được: <b>${heard}</b></div>`;
      this.el("btnNext").classList.remove("hidden");
      SRS.quizResult(this.word().w, true);
    } else if (best >= 0.55) {
      res.innerHTML = `<div class="verdict close">Gần đúng — thử lại nhé</div>
        <div class="heard">Web nghe thành: <b>${heard || "(không rõ)"}</b></div>`;
    } else {
      res.innerHTML = `<div class="verdict bad">Chưa đúng</div>
        <div class="heard">Web nghe thành: <b>${heard || "(không rõ)"}</b> — nghe mẫu rồi đọc lại</div>`;
    }
  },

  setupRec() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.el("noSupport").style.display = "block";
      this.el("btnMic").disabled = true;
      return;
    }
    this.rec = new SR();
    this.rec.lang = "en-US";
    this.rec.interimResults = false;
    this.rec.maxAlternatives = 5;
    this.rec.onresult = e => {
      const alts = [...e.results[0]].map(r => r.transcript);
      this.judge(alts);
    };
    this.rec.onerror = e => {
      const msg = e.error === "not-allowed"
        ? "Bị chặn mic — cấp quyền micro cho trang này trong Chrome."
        : e.error === "no-speech" ? "Không nghe thấy gì — thử đọc to hơn." : "Lỗi: " + e.error;
      this.el("result").innerHTML = `<div class="verdict bad">${msg}</div>`;
    };
    this.rec.onend = () => {
      this.listening = false;
      this.el("btnMic").classList.remove("listening");
    };
  },

  listen() {
    if (!this.rec || this.listening) return;
    TTS.stop();
    this.listening = true;
    this.el("btnMic").classList.add("listening");
    this.el("result").innerHTML = `<div class="muted">Đang nghe… đọc từ đi anh!</div>`;
    try { this.rec.start(); }
    catch { // start() lỗi (bấm quá nhanh...) — trả lại trạng thái để bấm tiếp được
      this.listening = false;
      this.el("btnMic").classList.remove("listening");
      this.el("result").innerHTML = `<div class="verdict bad">Mic chưa sẵn sàng — bấm lại nhé.</div>`;
    }
  },

  next() {
    this.idx++;
    this.show();
  },

  finish() {
    document.querySelector(".flash-zone").classList.add("hidden");
    this.el("donePanel").classList.remove("hidden");
    this.el("doneStats").textContent =
      `Đạt ${this.passed}/${this.queue.length} từ. Luyện đều mỗi tuần vài lần là lên nhanh.`;
  },

  init() {
    this.setupRec();
    this.buildQueue();
    this.show();
    this.el("btnMic").onclick = () => this.listen();
    this.el("btnHear").onclick = () => {
      const w = this.word();
      if (w) TTS.speak(w.w, "en-US", Store.data.settings.rate * 0.9);
    };
    this.el("btnSkip").onclick = () => this.next();
    this.el("btnNext").onclick = () => this.next();
    this.el("btnAgain").onclick = () => {
      document.querySelector(".flash-zone").classList.remove("hidden");
      this.el("donePanel").classList.add("hidden");
      this.buildQueue();
      this.show();
    };
    SYNC.init(() => {});
  },
};

Speak.init();
