/* Flashcard: ôn từ đến hạn trước, rồi học từ mới (giới hạn newPerDay/ngày) */

const Learn = {
  queue: [], idx: 0, graded: 0, correct: 0,
  el(id) { return document.getElementById(id); },

  buildQueue(extraNew = 0) {
    const due = SRS.dueWords();
    const npd = Store.data.settings.newPerDay;
    let newCount = npd === 0 ? 10 : Math.max(0, npd - Store.todayLog().new);
    newCount += extraNew;
    const news = SRS.newWords(newCount);
    this.queue = [...due, ...news];
    this.idx = 0;
  },

  card() { return this.queue[this.idx]; },

  show() {
    const w = this.card();
    if (!w) return this.finish();
    this.el("flashcard").classList.remove("flipped");
    this.el("gradeRow").classList.add("hidden");
    this.el("fPos") .textContent = `(${w.p}) · cấp ${w.l}`;
    this.el("fWord").textContent = w.w;
    this.el("fIpa") .textContent = "/" + w.i + "/";
    this.el("bWord").textContent = w.w;
    this.el("bIpa") .textContent = "/" + w.i + "/";
    this.el("bVi")  .textContent = w.v;
    this.el("bEx")  .textContent = w.ex;
    this.el("bExVi").textContent = w.xv;
    renderIllust(this.el("fIllust"), w, "flash-illust"); // hình mặt trước
    const mn = this.el("bMnemonic");                     // câu liên tưởng mặt sau
    if (w.m) { mn.textContent = "💡 " + w.m; mn.classList.remove("hidden"); }
    else mn.classList.add("hidden");
    this.el("leftCount").textContent = this.queue.length - this.idx;
    TTS.speak(w.w, "en-US", Store.data.settings.rate, TTS.enVoiceFor(this.idx));
  },

  flip() {
    const fc = this.el("flashcard");
    if (fc.classList.contains("flipped")) return;
    fc.classList.add("flipped");
    this.el("gradeRow").classList.remove("hidden");
  },

  grade(g) {
    const w = this.card();
    if (!w) return;
    SRS.grade(w.w, g);
    this.graded++;
    if (g >= 2) this.correct++;
    if (g === 0) this.queue.push(w); // quên: gặp lại cuối phiên
    this.idx++;
    this.show();
  },

  finish() {
    this.el("flashZone").classList.add("hidden");
    this.el("donePanel").classList.remove("hidden");
    this.el("doneStats").textContent =
      `Anh vừa ôn ${this.graded} thẻ, nhớ ngay ${this.correct} thẻ. ` +
      `Tổng cộng đã học ${SRS.learnedWords().length}/${VOCAB.length} từ.`;
  },

  init() {
    this.buildQueue();
    this.el("flashcard").onclick = e => {
      if (e.target.closest("button")) return;
      this.flip();
    };
    this.el("btnSayFront").onclick = e => {
      e.stopPropagation();
      const w = this.card();
      if (w) TTS.speak(w.w, "en-US", Store.data.settings.rate, TTS.enVoiceFor(this.idx));
    };
    this.el("btnSayEx").onclick = e => {
      e.stopPropagation();
      const w = this.card();
      if (w) TTS.speak(w.ex, "en-US", Store.data.settings.rate);
    };
    document.querySelectorAll(".grade").forEach(b => {
      b.onclick = () => this.grade(+b.dataset.g);
    });
    this.el("btnMore").onclick = () => {
      this.buildQueue(10);
      if (!this.queue.length) {
        return toast("Anh đã học hết từ hiện có — quay lại hôm sau để ôn định kỳ nhé!");
      }
      this.el("flashZone").classList.remove("hidden");
      this.el("donePanel").classList.add("hidden");
      this.show();
    };
    // phím tắt máy tính: space lật, 1-4 chấm (không chặn khi focus đang ở nút/ô nhập)
    document.addEventListener("keydown", e => {
      const tag = document.activeElement?.tagName;
      if (tag === "BUTTON" || tag === "INPUT" || tag === "A" || tag === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); this.flip(); }
      if (["1", "2", "3", "4"].includes(e.key) &&
          !this.el("gradeRow").classList.contains("hidden")) {
        this.grade(+e.key - 1);
      }
    });
    if (!this.queue.length) this.finish();
    else this.show();
    SYNC.init(() => {});
  },
};

Learn.init();
