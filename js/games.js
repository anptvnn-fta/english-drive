/* 4 trò chơi 10 câu — luôn hiển thị phiên âm (khắc phục điểm yếu Memrise) */

const Games = {
  game: null, pool: [], questions: [], qi: 0,
  score: 0, streak: 0, locked: false,

  el(id) { return document.getElementById(id); },

  buildPool() {
    // ưu tiên từ đã gặp; chưa đủ 12 thì lấy thêm từ đầu lộ trình
    let pool = SRS.learnedWords();
    if (pool.length < 12) {
      const have = new Set(pool.map(x => x.w));
      pool = pool.concat(VOCAB.filter(x => !have.has(x.w)).slice(0, 20 - pool.length));
    }
    this.pool = pool;
  },

  start(game) {
    this.game = game;
    this.score = 0; this.streak = 0; this.qi = 0;
    this.questions = shuffle(this.pool).slice(0, 10);
    if (this.questions.length < 4) return toast("Chưa đủ từ để chơi — học vài từ trước đã!");
    this.el("gamePick").classList.add("hidden");
    this.el("gameDone").classList.add("hidden");
    this.el("gameZone").classList.remove("hidden");
    this.ask();
  },

  hud() {
    this.el("qNum").textContent = this.qi + 1;
    this.el("hudScore").textContent = this.score + " điểm";
    this.el("hudStreak").textContent = this.streak >= 2 ? `🔥 chuỗi ${this.streak}` : "";
  },

  ask() {
    if (this.qi >= this.questions.length) return this.finish();
    this.locked = false;
    this.hud();
    const w = this.questions[this.qi];
    const prompt = this.el("quizPrompt");
    const opts = this.el("options");
    opts.innerHTML = "";
    opts.classList.remove("hidden");
    this.el("spellZone").classList.add("hidden");

    if (this.game === "envi") {
      prompt.innerHTML = `<div class="game-illust hidden" id="gIllust"></div><div class="quiz-word">${w.w}</div><div class="quiz-sub">/${w.i}/</div>`;
      renderIllust(document.getElementById("gIllust"), w, "game-illust");
      TTS.speak(w.w, "en-US", Store.data.settings.rate, TTS.enVoiceFor(this.qi));
      this.renderOptions(w, sample(this.pool, 3, w.w), x => x.v, x => x.w === w.w);
    } else if (this.game === "vien") {
      prompt.innerHTML = `<div class="quiz-vi-prompt">${w.v}</div>`;
      this.renderOptions(w, sample(this.pool, 3, w.w), x => `${x.w} <span class="mono muted" style="font-size:0.85em">/${x.i}/</span>`, x => x.w === w.w);
    } else if (this.game === "listen") {
      prompt.innerHTML = `<button class="speak-icon" style="font-size:2rem" id="btnHear">🔊 Nghe lại</button>`;
      TTS.speak(w.w, "en-US", Store.data.settings.rate, TTS.enVoiceFor(this.qi));
      document.getElementById("btnHear").onclick = () => TTS.speak(w.w, "en-US", Store.data.settings.rate, TTS.enVoiceFor(this.qi));
      this.renderOptions(w, sample(this.pool, 3, w.w), x => `${x.w} <span class="mono muted" style="font-size:0.85em">/${x.i}/</span>`, x => x.w === w.w);
    } else if (this.game === "spell") {
      prompt.innerHTML = `<div class="game-illust hidden" id="gIllust"></div><div class="quiz-vi-prompt">${w.v}</div><div class="quiz-sub">/${w.i}/</div>
        <button class="speak-icon" id="btnHear" style="margin-top:8px">🔊 Nghe</button>`;
      renderIllust(document.getElementById("gIllust"), w, "game-illust");
      TTS.speak(w.w, "en-US", Store.data.settings.rate, TTS.enVoiceFor(this.qi));
      document.getElementById("btnHear").onclick = () => TTS.speak(w.w, "en-US", Store.data.settings.rate, TTS.enVoiceFor(this.qi));
      opts.classList.add("hidden");
      this.renderSpell(w);
    }
  },

  renderOptions(w, wrongs, labelFn, isCorrectFn) {
    const choices = shuffle([w, ...wrongs]);
    const opts = this.el("options");
    for (const c of choices) {
      const b = document.createElement("button");
      b.className = "opt";
      b.innerHTML = labelFn(c);
      if (isCorrectFn(c)) b.dataset.correct = "1";
      b.onclick = () => {
        if (this.locked) return;
        this.locked = true;
        const correct = b.dataset.correct === "1";
        b.classList.add(correct ? "correct" : "wrong");
        if (!correct) opts.querySelector("[data-correct]")?.classList.add("correct");
        this.answer(w, correct);
      };
      opts.appendChild(b);
    }
  },

  renderSpell(w) {
    this.el("spellZone").classList.remove("hidden");
    const slots = this.el("slots"), tiles = this.el("tiles");
    slots.innerHTML = ""; tiles.innerHTML = "";
    const chars = w.w.split("");
    const filled = [];
    chars.forEach(ch => {
      const d = document.createElement("div");
      d.className = "slot" + (ch === " " ? " space" : "");
      if (ch === " ") { d.dataset.space = "1"; filled.push(" "); }
      else filled.push(null);
      slots.appendChild(d);
    });
    // chữ cái của từ + 2 chữ gây nhiễu
    const decoys = shuffle("aeioustrnl".split("")).slice(0, 2);
    const letters = shuffle([...chars.filter(c => c !== " "), ...decoys]);
    letters.forEach(ch => {
      const tile = document.createElement("button");
      tile.className = "tile";
      tile.textContent = ch;
      tile.onclick = () => {
        if (this.locked || tile.classList.contains("used")) return;
        const pos = filled.indexOf(null);
        if (pos === -1) return;
        filled[pos] = ch;
        tile.classList.add("used");
        const slot = slots.children[pos];
        slot.textContent = ch;
        slot.classList.add("filled");
        slot.onclick = () => { // bấm slot để trả chữ về
          if (this.locked || filled[pos] === null) return;
          filled[pos] = null;
          slot.textContent = "";
          slot.classList.remove("filled");
          tile.classList.remove("used");
        };
        if (!filled.includes(null)) {
          this.locked = true;
          const guess = filled.join("");
          const correct = guess === w.w;
          [...slots.children].forEach(sl => {
            if (!sl.dataset.space) sl.style.borderColor = correct ? "var(--green)" : "var(--red)";
          });
          if (!correct) {
            const reveal = document.createElement("div");
            reveal.className = "quiz-sub";
            reveal.style.marginTop = "14px";
            reveal.textContent = "Đúng ra là: " + w.w;
            this.el("spellZone").appendChild(reveal);
          }
          this.answer(w, correct);
        }
      };
      tiles.appendChild(tile);
    });
  },

  answer(w, correct) {
    SRS.quizResult(w.w, correct);
    if (correct) {
      this.streak++;
      this.score += 10 + Math.min(this.streak - 1, 5) * 2;
      TTS.speak(w.w, "en-US", Store.data.settings.rate, TTS.enVoiceFor(this.qi));
    } else {
      this.streak = 0;
    }
    this.hud();
    setTimeout(() => { this.qi++; this.ask(); }, correct ? 1100 : 2200);
  },

  finish() {
    this.el("gameZone").classList.add("hidden");
    this.el("gameDone").classList.remove("hidden");
    const max = this.questions.length * 20;
    this.el("doneTitle").textContent =
      this.score >= max * 0.7 ? "Tuyệt vời! 🏆" : this.score >= max * 0.4 ? "Khá lắm!" : "Hết vòng!";
    this.el("doneMsg").textContent =
      `${this.score} điểm. Từ trả lời sai sẽ tự quay lại lịch ôn hôm nay.`;
  },

  init() {
    this.buildPool();
    this.el("poolCount").textContent = this.pool.length;
    document.querySelectorAll(".game-card").forEach(b => {
      b.onclick = () => this.start(b.dataset.game);
    });
    this.el("btnQuit").onclick = () => {
      this.el("gameZone").classList.add("hidden");
      this.el("gamePick").classList.remove("hidden");
    };
    this.el("btnAgain").onclick = () => this.start(this.game);
    SYNC.init(() => { this.buildPool(); this.el("poolCount").textContent = this.pool.length; });
  },
};

Games.init();
