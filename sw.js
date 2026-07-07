/* Service Worker EngDrive — chạy offline khi mất mạng trên xe.
   Chiến lược: NETWORK-FIRST cho tài nguyên cùng origin (luôn lấy bản mới khi có mạng,
   rớt mạng thì trả bản đã cache) → tránh bẫy "kẹt code cũ" của cache-first.
   Bỏ qua request khác origin (Supabase API, Google Fonts) để trình duyệt tự lo. */
const CACHE = "engdrive-v1";
const SHELL = [
  "index.html", "car.html", "learn.html", "games.html", "speak.html",
  "css/style.css", "vendor/ts-fsrs.umd.js",
  "js/core.js", "js/sync.js", "js/learn.js", "js/home.js", "js/games.js", "js/speak.js", "js/car.js",
  "data/level1.js", "data/level2.js", "data/level3.js", "data/level4.js",
  "data/ngsl1.js", "data/ngsl2.js", "data/ngsl3.js",
  "data/finance.js", "data/business.js", "data/extras.js", "data/dialogs.js",
];

self.addEventListener("install", e => {
  // precache khung app để lần offline đầu tiên vẫn chạy được (ảnh cache dần khi dùng)
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== location.origin) return; // Supabase/Fonts để mạng lo
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)); // cập nhật cache nền
      }
      return res;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === "navigate") return caches.match("index.html"); // điều hướng offline → trang chủ đã cache
      throw new Error("offline");
    }
  })());
});
