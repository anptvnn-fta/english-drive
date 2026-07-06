/* ============================================================
   ENGDRIVE core: từ điển, tiến độ, SRS, TTS, tiện ích
   ============================================================ */

/* ---------- Gộp từ điển theo lộ trình ---------- */
const LEVELS = [
  { n: 1, name: "Nền tảng", desc: "Từ gốc cho người mới bắt đầu", arr: window.VOCAB_L1 || [] },
  { n: 2, name: "Thông dụng 1", desc: "Từ hay gặp nhất theo chuẩn NGSL", arr: window.VOCAB_NGSL1 || [] },
  { n: 3, name: "Công việc & giao tiếp", desc: "Văn phòng, trao đổi hằng ngày", arr: window.VOCAB_L2 || [] },
  { n: 4, name: "Thông dụng 2", desc: "NGSL nhóm tần suất tiếp theo", arr: window.VOCAB_NGSL2 || [] },
  { n: 5, name: "Dữ liệu cơ bản", desc: "Từ vựng dữ liệu dùng mỗi ngày", arr: window.VOCAB_L3 || [] },
  { n: 6, name: "Thông dụng 3", desc: "NGSL hoàn thiện vốn 1.200 từ lõi", arr: window.VOCAB_NGSL3 || [] },
  { n: 7, name: "Dữ liệu nâng cao", desc: "Thống kê, máy học, kỹ thuật dữ liệu", arr: window.VOCAB_L4 || [] },
];

const VOCAB = (() => {
  const seen = new Set();
  const extras = window.VOCAB_EXTRAS || {};
  const out = [];
  LEVELS.forEach(L => L.arr.forEach(x => {
    const key = x.w.toLowerCase().trim();
    if (seen.has(key)) return; // chống trùng giữa các level
    seen.add(key);
    // gộp minh họa (e=emoji, img=ảnh, m=câu liên tưởng) — tùy chọn, không ghi đè trường gốc
    const ex = extras[key] || {};
    out.push({ ...x, w: key, l: L.n, e: ex.e || null, img: ex.img || null, m: ex.m || null });
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
      settings: { reps: 4, gap: 7, rate: 0.9, newPerDay: 10, voiceMode: "mix", shadow: false },
      words: {},   // w -> {box, due, seen, ok, bad, fc?}  (fc = thẻ FSRS)
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

/* ---------- SRS: FSRS v6 (ts-fsrs, MIT) với fallback Leitner ---------- */
const INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60]; // ngày theo box 0..7 (fallback + hiển thị)
const FSRSLib = window.FSRS || null;
const FScheduler = FSRSLib
  ? FSRSLib.fsrs(FSRSLib.generatorParameters({
      request_retention: 0.9,
      maximum_interval: 180,
      // bỏ bước học 1m/10m: app học theo phiên mỗi ngày, không canh đồng hồ phút
      learning_steps: [],
      relearning_steps: [],
    }))
  : null;

// box "gương" từ stability của FSRS — dùng cho hiển thị lộ trình và merge đồng bộ
function boxFromStability(s) {
  return s < 1 ? 1 : s < 2 ? 2 : s < 4 ? 3 : s < 7 ? 4 : s < 15 ? 5 : s < 30 ? 6 : 7;
}

const SRS = {
  // g: 0 quên | 1 mơ hồ | 2 nhớ | 3 dễ
  grade(w, g) {
    const st = Store.st(w);
    const wasNew = st.box === 0;
    const now = Date.now();
    st.seen++;
    if (g === 0) st.bad++; else st.ok++;
    if (FScheduler) {
      // di trú từ Leitner cũ: dựng thẻ FSRS tương đương lần đầu gặp
      if (!st.fc && st.box > 0) {
        const c = FSRSLib.createEmptyCard(new Date(now - INTERVALS[st.box] * DAY));
        c.stability = Math.max(0.9, INTERVALS[st.box] * 0.9); // 0.9× để boxFromStability trả đúng box cũ
        c.difficulty = 5;
        c.state = FSRSLib.State.Review;
        c.reps = st.seen;
        c.last_review = new Date(now - INTERVALS[st.box] * DAY);
        st.fc = c;
      }
      const card = st.fc || FSRSLib.createEmptyCard(new Date(now));
      const rating = [FSRSLib.Rating.Again, FSRSLib.Rating.Hard, FSRSLib.Rating.Good, FSRSLib.Rating.Easy][g];
      const rec = FScheduler.next(card, new Date(now), rating);
      st.fc = rec.card;
      st.due = new Date(rec.card.due).getTime();
      if (g === 0) st.due = Math.min(st.due, now + 10 * 60000); // quên: gặp lại trong phiên
      // box hiển thị: chỉ tin stability khi thẻ đã vào trạng thái Review ổn định
      st.box = g === 0 ? 1 :
        (rec.card.state === FSRSLib.State.Review ? boxFromStability(rec.card.stability) : 1);
    } else {
      if (g === 0) { st.box = 1; st.due = now + 10 * 60000; }
      else if (g === 1) { st.box = Math.max(1, st.box); st.due = now + Math.max(1, INTERVALS[st.box] * 0.5) * DAY; }
      else if (g === 2) { st.box = Math.min(7, st.box + 1); st.due = now + INTERVALS[st.box] * DAY; }
      else { st.box = Math.min(7, st.box + 2); st.due = now + INTERVALS[st.box] * DAY; }
    }
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
    } else {
      st.bad++;
      // trả lời sai trong game cũng phải ghi vào thẻ FSRS, không thì lịch ôn coi như chưa từng sai
      if (FScheduler && st.fc) {
        const rec = FScheduler.next(st.fc, new Date(), FSRSLib.Rating.Again);
        st.fc = rec.card;
        st.box = 1;
      }
      st.due = Date.now();
      Store.logInc("review");
    }
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
  enVoice: null, viVoice: null, enVoices: [], _cancelledAt: 0,
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
    // đa giọng: mỗi vùng lấy 1 giọng tốt nhất (Mỹ luôn đứng đầu)
    this.enVoices = ["en-us", "en-gb", "en-au", "en-in"]
      .map(find).filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);
    if (!this.enVoices.length && this.enVoice) this.enVoices = [this.enVoice];
  },
  /* Giọng tiếng Anh cho lượt đọc thứ n: chế độ mix xoay vòng, single luôn giọng Mỹ */
  enVoiceFor(n) {
    if (!this.enVoices.length) this.pick(); // giọng load muộn trên Android
    if (Store.data.settings.voiceMode !== "mix" || this.enVoices.length < 2) return this.enVoice;
    return this.enVoices[n % this.enVoices.length];
  },
  init() {
    if (!("speechSynthesis" in window)) return;
    this.pick();
    speechSynthesis.onvoiceschanged = () => this.pick();
  },
  async speak(text, lang = "en-US", rate = 1, voice = null) {
    if (!("speechSynthesis" in window) || !text) return;
    // Chrome Android nuốt utterance được queue ngay sau cancel() (crbug 509488)
    const sinceCancel = Date.now() - this._cancelledAt;
    if (sinceCancel < 220) await new Promise(r => setTimeout(r, 220 - sinceCancel));
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      // giọng có thể load muộn trên Android — thử chọn lại ngay trước khi đọc
      let v = voice || (lang.startsWith("en") ? this.enVoice : this.viVoice);
      if (!v) {
        this.pick();
        v = lang.startsWith("en") ? this.enVoice : this.viVoice;
      }
      if (v) { u.voice = v; u.lang = v.lang; } // lang phải khớp voice, Android mới chịu đổi chất giọng
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

/* Vẽ minh họa cho 1 từ vào phần tử el: ưu tiên ảnh, rồi emoji, không có thì ẩn.
   base = class gốc theo ngữ cảnh (flash-illust / game-illust / car-illust). */
function renderIllust(el, w, base) {
  if (!el) return;
  if (w && w.img) {
    el.className = base;
    el.innerHTML = `<img src="${w.img}" alt="" decoding="async">`; // không lazy: ảnh nhỏ, luôn trong tầm nhìn
  } else if (w && w.e) {
    el.className = base + " emoji";
    el.textContent = w.e;
  } else {
    el.className = base + " hidden";
    el.textContent = "";
  }
}

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
