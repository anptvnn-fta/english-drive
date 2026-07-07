/* Flashcard: ôn từ đến hạn trước, rồi học từ mới (giới hạn newPerDay/ngày) */

const Learn = {
  queue: [], idx: 0, graded: 0, correct: 0,
  el(id) { return document.getElementById(id); },

  buildQueue(extraNew = 0) {
    const npd = Store.data.settings.newPerDay;
    // giới hạn từ đến hạn mỗi phiên — tránh queue vài trăm từ gây kiệt sức sau kỳ nghỉ dài
    const maxDue = Math.max(npd * 3, 30);
    const due = SRS.dueWords().slice(0, maxDue);
    // newPerDay=0: tạm dừng học từ mới hôm nay (mặc định 10, xem Store.defaults())
    let newCount = Math.max(0, npd - Store.todayLog().new);
    newCount += extraNew;
    const news = SRS.newWords(newCount);
    this.queue = [...due, ...news];
    this.idx = 0;
  },

  /* Ôn nhanh: gom ~15 từ RỦI RO QUÊN cao nhất (quá hạn nhiều + hay sai + box thấp) */
  buildQuickQueue(limit = 15) {
    const now = Date.now();
    const scored = VOCAB
      .filter(x => { const s = Store.data.words[x.w]; return s && s.box > 0; })
      .map(x => {
        const s = Store.data.words[x.w];
        const overdue = Math.max(0, now - s.due) / DAY;          // số ngày quá hạn
        const failRate = (s.bad || 0) / Math.max(1, s.seen || 1); // tỷ lệ sai
        const lowBox = 8 - s.box;                                 // box thấp = mới nhớ
        return { x, risk: overdue * 1.5 + failRate * 5 + lowBox * 0.6 };
      })
      .sort((a, b) => b.risk - a.risk)
      .slice(0, limit)
      .map(r => r.x);
    this.queue = shuffle(scored);
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
    if (this.graded === 0) { const h = this.el("gradeHint"); if (h) h.style.display = "none"; } // ẩn gợi ý sau lần chấm đầu
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
    const title = this.el("doneTitle"), stats = this.el("doneStats");
    if (this.graded > 0) {
      if (title) title.textContent = "Xong phiên hôm nay!";
      stats.textContent =
        `Anh vừa ôn ${this.graded} thẻ, nhớ ngay ${this.correct} thẻ. ` +
        `Tổng cộng đã học ${SRS.learnedWords().length}/${VOCAB.length} từ.`;
      return;
    }
    // queue rỗng ngay từ đầu — giải thích lý do thay vì hiện "ôn 0 thẻ"
    if (this.quick) {
      if (title) title.textContent = "Chưa có gì để ôn nhanh";
      stats.textContent = "Anh chưa học từ nào — vào Flashcard học vài từ trước, rồi quay lại Ôn nhanh nhé!";
    } else {
      const npd = Store.data.settings.newPerDay, todayNew = Store.todayLog().new;
      if (title) title.textContent = "Chưa có từ cần ôn";
      if (npd === 0)
        stats.textContent = "Đang tạm dừng học từ mới (đặt 0 ở Trang chủ) và không có từ đến hạn. Chỉnh lại số từ mới nếu muốn học tiếp.";
      else if (todayNew >= npd)
        stats.textContent = `Anh đã học đủ ${npd} từ mới hôm nay. Mai quay lại tiếp, hoặc nhấn "Học thêm" bên dưới.`;
      else
        stats.textContent = 'Không có từ đến hạn ôn — anh đang nhớ tốt. Nhấn "Học thêm" để học từ mới, hoặc quay lại ngày mai.';
    }
  },

  init() {
    this.quick = /quick/.test(location.search + location.hash); // hash bền hơn query khi server dùng URL sạch
    if (this.quick) {
      this.buildQuickQueue();
      const head = document.querySelector(".study-head h2");
      if (head) head.textContent = "⚡ Ôn nhanh — từ sắp quên nhất";
      const more = this.el("btnMore");
      if (more) more.textContent = "Ôn nhanh lượt nữa";
    } else {
      this.buildQueue();
    }
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
      if (this.quick) { this.buildQuickQueue(); }
      else { this.buildQueue(10); }
      if (!this.queue.length) {
        return toast(this.quick ? "Không còn từ rủi ro nào — anh đang nhớ tốt!" : "Anh đã học hết từ hiện có — quay lại hôm sau để ôn định kỳ nhé!");
      }
      this.graded = 0; this.correct = 0; // lượt mới: đếm lại từ đầu, không dồn qua lượt trước
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
