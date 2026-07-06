/* ============================================================
   Sinh ảnh minh họa AI cho các từ trừu tượng (chạy TAY, không nằm trong web).
   Dùng Gemini image API bậc miễn phí (~500 ảnh/ngày, ~2 ảnh/phút).

   Cách chạy:
     GEMINI_API_KEY=xxx  node tools/gen-images.mjs [limit]
   Hoặc trên Windows PowerShell:
     $env:GEMINI_API_KEY="xxx"; node tools/gen-images.mjs 450

   - Chỉ sinh ảnh cho từ CHƯA có ảnh (đọc trạng thái từ data/extras.js).
   - Ưu tiên từ chưa có bất kỳ minh họa nào (không emoji, không mnemonic), rồi tới từ trừu tượng khác.
   - Lưu img/<w>.webp (512px) và cập nhật trường img trong data/extras.js.
   - Chạy lại nhiều ngày để hoàn tất; log từ nào lỗi để hôm sau chạy bù.
   Cần: Node 18+, và (khuyến nghị) `npm i sharp` để nén webp. Không có sharp thì lưu PNG.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("Thiếu GEMINI_API_KEY."); process.exit(1); }
const LIMIT = parseInt(process.argv[2] || "450", 10);
const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image"; // kiểm tra model hiện hành trước khi chạy
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const IMG_DIR = path.join(ROOT, "img");
fs.mkdirSync(IMG_DIR, { recursive: true });

// nạp sharp nếu có
let sharp = null;
try { sharp = (await import("sharp")).default; } catch { console.warn("Không có sharp — lưu PNG thay vì webp (nặng hơn). Cài: npm i sharp"); }

/* ---- đọc từ điển + extras ---- */
const g = {};
for (const f of ["level1","level2","level3","level4","ngsl1","ngsl2","ngsl3","extras"]) {
  const src = fs.readFileSync(path.join(ROOT, "data", f + ".js"), "utf8");
  new Function("window", src)(g);
}
const LEVELS = [g.VOCAB_L1,g.VOCAB_NGSL1,g.VOCAB_L2,g.VOCAB_NGSL2,g.VOCAB_L3,g.VOCAB_NGSL3,g.VOCAB_L4];
const seen = new Set(); const vocab = [];
for (const arr of LEVELS) for (const x of arr) { const k = x.w.toLowerCase().trim(); if (!seen.has(k)) { seen.add(k); vocab.push({ ...x, w: k }); } }
const extras = g.VOCAB_EXTRAS || {};

// ưu tiên: chưa có gì > có mnemonic nhưng không emoji > có emoji (bỏ qua, emoji đã đủ)
const need = vocab.filter(x => { const e = extras[x.w] || {}; return !e.img && !e.e; }); // từ không emoji, chưa có ảnh
need.sort((a, b) => {
  const ea = extras[a.w] || {}, eb = extras[b.w] || {};
  return (ea.m ? 1 : 0) - (eb.m ? 1 : 0); // chưa có mnemonic lên trước
});
const batch = need.slice(0, LIMIT);
console.log(`Cần ảnh: ${need.length} từ. Sinh phiên này: ${batch.length}.`);

const prompt = (w) =>
  `Minimal flat vector illustration representing the concept "${w.w}" (meaning: ${w.v}). ` +
  `One clear central visual metaphor, simple geometric shapes, soft muted colors, plain white background, ` +
  `no text, no letters, no words, no numbers. Educational icon style, centered, 1:1.`;

async function genOne(w) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt(w) }] }] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.data);
  if (!imgPart) throw new Error("Không có ảnh trả về");
  const buf = Buffer.from(imgPart.inlineData.data, "base64");
  if (sharp) {
    await sharp(buf).resize(512, 512, { fit: "contain", background: "#ffffff" }).webp({ quality: 80 }).toFile(path.join(IMG_DIR, w.w + ".webp"));
    return "img/" + w.w + ".webp";
  } else {
    fs.writeFileSync(path.join(IMG_DIR, w.w + ".png"), buf);
    return "img/" + w.w + ".png";
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const failed = [];
let done = 0;
for (const w of batch) {
  try {
    const rel = await genOne(w);
    extras[w.w] = { ...(extras[w.w] || {}), img: rel };
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${batch.length}...`);
  } catch (e) {
    failed.push(w.w + ": " + e.message);
  }
  await sleep(31000); // ~2 ảnh/phút để không vượt rate limit bậc free
}

/* ---- ghi lại extras.js ---- */
const keys = Object.keys(extras).sort();
const body = keys.map(k => "  " + JSON.stringify(k) + ": " + JSON.stringify(extras[k])).join(",\n");
const header = "/* Minh họa từ vựng — e=emoji | img=ảnh AI | m=câu liên tưởng. Tùy chọn từng từ.\n   Sinh tự động. */\n";
fs.writeFileSync(path.join(ROOT, "data", "extras.js"), header + "window.VOCAB_EXTRAS = {\n" + body + "\n};\n");

console.log(`\nXong: ${done} ảnh. Lỗi: ${failed.length}.`);
if (failed.length) { fs.writeFileSync(path.join(ROOT, "tmp", "img-failed.txt"), failed.join("\n")); console.log("Danh sách lỗi: tmp/img-failed.txt"); }
console.log(`Còn lại chưa có ảnh: ${need.length - done} từ — chạy lại script ngày mai để hoàn tất.`);
