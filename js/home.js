/* Trang chủ: thống kê, lộ trình, đồng bộ, cài đặt */

const Home = {
  el(id) { return document.getElementById(id); },

  renderStats() {
    this.el("stLearned").textContent = SRS.learnedWords().length;
    this.el("stDue").textContent = SRS.dueWords().length;
    this.el("stStreak").textContent = Store.streak();
    this.el("stToday").textContent = Store.todayLog().new;
    const due = SRS.dueWords().length;
    this.el("mFlash").textContent = due
      ? `${due} từ đến hạn ôn đang chờ`
      : "Ôn từ đến hạn + học từ mới";
  },

  renderRoadmap() {
    const zone = this.el("roadmap");
    zone.innerHTML = "";
    for (const L of LEVELS) {
      const words = VOCAB.filter(x => x.l === L.n);
      const learned = words.filter(x => { const s = Store.data.words[x.w]; return s && s.box > 0; }).length;
      const pct = words.length ? Math.round(learned / words.length * 100) : 0;
      const units = chunk(words, UNIT_SIZE);
      const chips = units.map(u => {
        const n = u.filter(x => { const s = Store.data.words[x.w]; return s && s.box > 0; }).length;
        const cls = n === u.length ? "done" : n > 0 ? "part" : "";
        const tip = u.map(x => x.w).join(", ");
        return `<span class="unit-chip ${cls}" title="${tip}"></span>`;
      }).join("");
      const div = document.createElement("div");
      div.className = "card level" + (learned === 0 && pct === 0 ? " locked" : "");
      div.innerHTML = `
        <div class="level-head">
          <span class="level-num">${L.n}</span>
          <div><b>${L.name}</b><div class="muted">${L.desc}</div></div>
          <span class="level-pct">${learned}/${words.length} · ${pct}%</span>
        </div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="units">${chips}</div>`;
      zone.appendChild(div);
    }
  },

  renderSync() {
    const box = this.el("syncStatus");
    const code = SYNC.code;
    if (!code) { box.innerHTML = "Chưa bật — tiến độ chỉ lưu trên máy này"; return; }
    const last = +localStorage.getItem(SYNC.lastKey) || 0;
    const when = last ? new Date(last).toLocaleString("vi-VN") : "chưa lần nào";
    const stt = { off: "tắt", ok: "✓ đã đồng bộ", error: "⚠ lỗi mạng", syncing: "đang đồng bộ…" }[SYNC.status] || "";
    box.innerHTML = `Mã: <b>${code}</b> · ${stt} · lần cuối: ${when}`;
  },

  bindSync() {
    SYNC.onStatus = () => this.renderSync();
    this.el("btnNewCode").onclick = async () => {
      if (SYNC.code && !confirm("Đang có mã đồng bộ. Tạo mã mới sẽ tách khỏi tiến độ chung. Tiếp tục?")) return;
      SYNC.setCode(SYNC.newCode());
      this.renderSync();
      await SYNC.syncNow();
      toast("Đã tạo mã. Nhập đúng mã này trên thiết bị kia.");
      this.renderSync();
    };
    this.el("btnEnterCode").onclick = async () => {
      const v = prompt("Nhập mã đồng bộ (dạng xxxx-xxxx-xxxx-xxxx):", SYNC.code || "");
      if (!v) return;
      SYNC.setCode(v.toLowerCase().trim());
      const okd = await SYNC.syncNow();
      toast(okd ? "Đã kết nối và gộp tiến độ!" : "Không kết nối được — kiểm tra mã/mạng.");
      this.refresh();
    };
    this.el("btnSyncNow").onclick = async () => {
      if (!SYNC.code) return toast("Chưa có mã đồng bộ — bấm Tạo mã mới trước.");
      const okd = await SYNC.syncNow();
      toast(okd ? "Đã đồng bộ xong!" : "Đồng bộ lỗi — thử lại sau.");
      this.refresh();
    };
    this.el("btnSyncOff").onclick = () => {
      SYNC.setCode("");
      this.renderSync();
      toast("Đã tắt đồng bộ trên máy này (dữ liệu vẫn còn).");
    };
  },

  bindSettings() {
    const s = Store.data.settings;
    const reps = this.el("setReps"), gap = this.el("setGap"),
      rate = this.el("setRate"), npd = this.el("setNewPerDay");
    reps.value = s.reps; gap.value = s.gap; rate.value = s.rate; npd.value = s.newPerDay;
    const out = () => {
      this.el("repsOut").textContent = reps.value;
      this.el("gapOut").textContent = gap.value;
      this.el("rateOut").textContent = Number(rate.value).toFixed(2) + "×";
    };
    out();
    const apply = () => {
      s.reps = +reps.value; s.gap = +gap.value; s.rate = +rate.value;
      s.newPerDay = Math.max(0, +npd.value || 0);
      Store.data.settingsAt = Date.now();
      Store.save(); out();
    };
    reps.oninput = apply; gap.oninput = apply; rate.oninput = apply; npd.onchange = apply;

    this.el("btnTestEn").onclick = () => TTS.speak("analysis", "en-US", s.rate);
    this.el("btnTestVi").onclick = () => TTS.speak("phân tích", "vi-VN", 1);

    this.el("btnExport").onclick = () => {
      const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `engdrive-tien-do-${Store.todayKey()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    this.el("btnImport").onclick = () => this.el("importFile").click();
    this.el("importFile").onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      f.text().then(txt => {
        try {
          const incoming = JSON.parse(txt);
          if (!incoming.words) throw new Error("bad file");
          SYNC.merge(incoming); // gộp thay vì ghi đè
          Store.save();
          this.refresh();
          toast("Đã gộp tiến độ từ file!");
        } catch { toast("File không hợp lệ."); }
      });
      e.target.value = "";
    };
    this.el("btnReset").onclick = () => {
      if (!confirm("Xóa TOÀN BỘ tiến độ học trên máy này? Không hoàn tác được.")) return;
      if (SYNC.code && !confirm("Đang bật đồng bộ: máy khác có thể trả lại dữ liệu cũ. Vẫn xóa?")) return;
      localStorage.removeItem(Store.key);
      Store.load();
      this.refresh();
      toast("Đã xóa tiến độ.");
    };
  },

  refresh() {
    this.renderStats();
    this.renderRoadmap();
    this.renderSync();
  },

  init() {
    this.bindSettings();
    this.bindSync();
    this.refresh();
    SYNC.init(() => this.refresh()).then(() => this.renderSync());
  },
};

Home.init();
