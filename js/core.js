/* ============================================================
   ENGDRIVE core: từ điển, tiến độ, SRS, TTS, tiện ích
   ============================================================ */

/* ---------- Gộp từ điển theo lộ trình ---------- */
const LEVELS = [
  { n: 1, name: "Nền tảng", desc: "Từ gốc cho người mới bắt đầu", arr: window.VOCAB_L1 || [] },
  { n: 2, name: "Công việc & giao tiếp", desc: "Văn phòng, trao đổi hằng ngày", arr: window.VOCAB_L2 || [] },
  { n: 3, name: "Dữ liệu cơ bản", desc: "Từ vựng dữ liệu dùng mỗi ngày", arr: window.VOCAB_L3 || [] },
  { n: 4, name: "Dữ liệu nâng cao", desc: "Thống kê, máy học, kỹ thuật dữ liệu", arr: window.VOCAB_L4 || [] },
];

const VOCAB = (() => {
  const seen = new Set();
  const out = [];
  LEVELS.forEach(L => L.arr.forEach(x => {
    const key = x.w.toLowerCase().trim();
    if (seen.has(key)) return; // chống trùng giữa các level
    seen.add(key);
    out.push({ ...x, w: key, l: L.n });
  }));
  return out;
})();
const BY_W = Object.fromEntries(VOCAB.map(x => [x.w, x]));
const UNIT_SIZE = 5;

/* ---------- Lưu trữ tiến độ (localStorage) ---------- */
const DAY = 86400000;
const Store = {
  key: "engdrive.v1",
  data: null,
  defaults() {
    return {
      settings: { reps: 4, gap: 7, rate: 0.9, newPerDay: 10 },
      words: {},   // w -> {box, due, seen, ok, bad}
      log: {},     // 'YYYY-MM-DD' -> {new, review, car}
    };
  },
  load() {
    try {
      this.data = { ...this.defaults(), ...JSON.parse(localStorage.getItem(this.key) || "{}") };
      this.data.settings = { ...this.defaults().settings, ...this.data.settings };
    } catch { this.data = this.defaults(); }
    return this.data;
  },
  save() {
    localStorage.setItem(this.key, JSON.stringify(this.data));
    if (window.SYNC) SYNC.markDirty();
  },
  st(w) {
    return this.data.words[w] || (this.data.words[w] = { box: 0, due: 0, seen: 0, ok: 0, bad: 0 });
  },
  todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
  logInc(field, n = 1) {
    const k = this.todayKey();
    const row = this.data.log[k] || (this.data.log[k] = { new: 0, review: 0, car: 0 });
    row[field] = (row[field] || 0) + n;
    this.save();
  },
  todayLog() { return this.data.log[this.todayKey()] || { new: 0, review: 0, car: 0 }; },
  streak() {
    let n = 0;
    const d = new Date();
    if (!this.data.log[this.todayKey()]) d.setDate(d.getDate() - 1); // hôm nay chưa học vẫn giữ chuỗi tới hôm qua
    for (;;) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (this.data.log[k]) { n++; d.setDate(d.getDate() - 1); } else break;
    }
    return n;
  },
};
Store.load();

/* ---------- SRS: hộp Leitner ---------- */
const INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60]; // ngày theo box 0..7
const SRS = {
  // g: 0 quên | 1 mơ hồ | 2 nhớ | 3 dễ
  grade(w, g) {
    const st = Store.st(w);
    const wasNew = st.box === 0;
    const now = Date.now();
    st.seen++;
    if (g === 0) { st.bad++; st.box = 1; st.due = now + 10 * 60000; }
    else if (g === 1) { st.ok++; st.box = Math.max(1, st.box); st.due = now + Math.max(1, INTERVALS[st.box] * 0.5) * DAY; }
    else if (g === 2) { st.ok++; st.box = Math.min(7, st.box + 1); st.due = now + INTERVALS[st.box] * DAY; }
    else { st.ok++; st.box = Math.min(7, st.box + 2); st.due = now + INTERVALS[st.box] * DAY; }
    Store.logInc(wasNew ? "new" : "review");
    Store.save();
  },
  carSeen(w) {
    const st = Store.st(w);
    st.seen++;
    if (st.box === 0) { st.box = 1; st.due = Date.now() + DAY; Store.logInc("new"); }
    else { st.due = Math.max(st.due, Date.now() + DAY); Store.logInc("car"); } // nghe lại trên xe: dời hạn ôn 1 ngày, chấm điểm thật ở flashcard
    Store.save();
  },
  quizResult(w, correct) {
    const st = Store.st(w);
    st.seen++;
    if (correct) {
      st.ok++;
      if (st.box === 0) { st.box = 1; st.due = Date.now() + DAY; Store.logInc("new"); return; }
      Store.logInc("review");
    } else { st.bad++; st.due = Date.now(); Store.logInc("review"); }
    Store.save();
  },
  dueWords() {
    const now = Date.now();
    return VOCAB.filter(x => { const s = Store.data.words[x.w]; return s && s.box > 0 && s.due <= now; })
      .sort((a, b) => Store.st(a.w).due - Store.st(b.w).due);
  },
  newWords(limit) {
    const out = [];
    for (const x of VOCAB) {
      const s = Store.data.words[x.w];
      if (!s || s.box === 0) { out.push(x); if (out.length >= limit) break; }
    }
    return out;
  },
  learnedWords() {
    return VOCAB.filter(x => { const s = Store.data.words[x.w]; return s && s.box > 0; });
  },
  newLeftToday() {
    return Math.max(0, Store.data.settings.newPerDay - Store.todayLog().new);
  },
};

/* ---------- TTS: đọc tiếng Anh + tiếng Việt ---------- */
const TTS = {
  enVoice: null, viVoice: null, _cancelledAt: 0,
  pick() {
    const vs = speechSynthesis.getVoices();
    const find = (pref) => {
      const cands = vs.filter(v => v.lang.replace("_", "-").toLowerCase().startsWith(pref));
      cands.sort((a, b) =>
        (b.name.includes("Google") - a.name.includes("Google")) ||
        (b.name.includes("Natural") - a.name.includes("Natural")) ||
        (b.localService - a.localService));
      return cands[0] || null;
    };
    this.enVoice = find("en-us") || find("en");
    this.viVoice = find("vi");
  },
  init() {
    if (!("speechSynthesis" in window)) return;
    this.pick();
    speechSynthesis.onvoiceschanged = () => this.pick();
  },
  async speak(text, lang = "en-US", rate = 1) {
    if (!("speechSynthesis" in window) || !text) return;
    // Chrome Android nuốt utterance được queue ngay sau cancel() (crbug 509488)
    const sinceCancel = Date.now() - this._cancelledAt;
    if (sinceCancel < 220) await new Promise(r => setTimeout(r, 220 - sinceCancel));
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      // giọng có thể load muộn trên Android — thử chọn lại ngay trước khi đọc
      let v = lang.startsWith("en") ? this.enVoice : this.viVoice;
      if (!v) {
        this.pick();
        v = lang.startsWith("en") ? this.enVoice : this.viVoice;
      }
      if (v) u.voice = v;
      u.rate = rate;
      let done = false;
      const fin = () => { if (!done) { done = true; clearTimeout(t); resolve(); } };
      u.onend = fin; u.onerror = fin;
      // watchdog: một số trình duyệt không bắn onend
      const t = setTimeout(fin, 2500 + text.length * 130 / rate);
      try { speechSynthesis.resume(); } catch {}
      speechSynthesis.speak(u);
    });
  },
  stop() {
    this._cancelledAt = Date.now();
    try { speechSynthesis.cancel(); } catch {}
  },
};
TTS.init();

/* ---------- Tiện ích ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sample(arr, n, excludeW) {
  return shuffle(arr.filter(x => x.w !== excludeW)).slice(0, n);
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function similarity(a, b) {
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}
function toast(msg, ms = 2200) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
