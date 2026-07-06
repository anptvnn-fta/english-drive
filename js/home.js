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

  renderProgress() {
    const words = Store.data.words;
    const now = Date.now();
    const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
    const in7 = now + 7 * DAY;
    let dueToday = 0, due7 = 0, ok = 0, bad = 0, learned = 0;
    const mastery = { fresh: 0, learning: 0, mastered: 0 }; // box 1-2 | 3-4 | 5-7
    for (const s of Object.values(words)) {
      if (s.box > 0) {
        learned++;
        if (s.due <= endToday.getTime()) dueToday++;
        if (s.due <= in7) due7++;
        if (s.box <= 2) mastery.fresh++; else if (s.box <= 4) mastery.learning++; else mastery.mastered++;
      }
      ok += s.ok || 0; bad += s.bad || 0;
    }
    const acc = (ok + bad) ? Math.round(ok / (ok + bad) * 100) : 0;

    // hoạt động 14 ngày gần nhất
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const row = Store.data.log[key] || { new: 0, review: 0, car: 0 };
      days.push({ dom: d.getDate(), total: (row.new || 0) + (row.review || 0) + (row.car || 0), today: i === 0 });
    }
    const maxDay = Math.max(1, ...days.map(d => d.total));
    const bars = days.map(d =>
      `<div class="mini-bar${d.today ? " today" : ""}" title="${d.total} lượt" style="--h:${Math.round(d.total / maxDay * 100)}%"><span>${d.dom}</span></div>`
    ).join("");

    const seg = (n, cls) => n > 0 ? `<i class="${cls}" style="flex:${n}" title="${n} từ"></i>` : "";
    const masteryBar = learned > 0
      ? `<div class="mastery-bar">${seg(mastery.fresh, "m-fresh")}${seg(mastery.learning, "m-learning")}${seg(mastery.mastered, "m-mastered")}</div>`
      : `<div class="muted" style="font-size:0.9rem">Chưa có từ nào — bắt đầu học để thấy tiến độ.</div>`;

    this.el("progressPanel").innerHTML = `
      <div class="prog-grid">
        <div class="prog-stat"><b>${dueToday}</b><span>đến hạn hôm nay</span></div>
        <div class="prog-stat"><b>${due7}</b><span>đến hạn trong 7 ngày</span></div>
        <div class="prog-stat"><b>${acc}%</b><span>độ chính xác ôn tập</span></div>
        <div class="prog-stat"><b>${learned}</b><span>từ đã vào lịch ôn</span></div>
      </div>
      <div class="prog-block">
        <div class="prog-label">Mức độ thành thạo</div>
        ${masteryBar}
        <div class="mastery-legend">
          <span><i class="m-fresh"></i> Mới học (${mastery.fresh})</span>
          <span><i class="m-learning"></i> Đang nhớ (${mastery.learning})</span>
          <span><i class="m-mastered"></i> Thành thạo (${mastery.mastered})</span>
        </div>
      </div>
      <div class="prog-block">
        <div class="prog-label">Hoạt động 14 ngày qua</div>
        <div class="mini-bars">${bars}</div>
      </div>`;
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
    // nhập mã qua ô input (prompt() bị chặn trên nhiều màn hình Android ô tô)
    this.el("btnEnterCode").onclick = async () => {
      const v = (this.el("syncCodeInput").value || "").toLowerCase().trim();
      if (!v) return toast("Gõ mã vào ô bên cạnh trước đã anh.");
      if (v.replace(/-/g, "").length < 12) return toast("Mã không hợp lệ — kiểm tra lại.");
      const oldCode = SYNC.code;
      SYNC.setCode(v);
      let remote = null;
      try { remote = await SYNC.pull(); }
      catch { SYNC.setCode(oldCode); return toast("Không kết nối được — kiểm tra mạng."); }
      const n = remote && remote.words ? Object.keys(remote.words).length : 0;
      const confirmBox = this.el("syncConfirm");
      if (n > 0) {
        // mã đã có dữ liệu: cho xem trước, xác nhận rồi mới gộp — tránh gộp nhầm mã người khác
        confirmBox.classList.remove("hidden");
        confirmBox.innerHTML =
          `Mã này đang giữ tiến độ <b>${n} từ</b>. Gộp vào máy này? ` +
          `<button class="btn btn-amber" id="btnMergeYes" style="margin:0 6px">Gộp tiến độ</button>` +
          `<button class="btn" id="btnMergeNo">Hủy</button>`;
        document.getElementById("btnMergeYes").onclick = async () => {
          confirmBox.classList.add("hidden");
          const okd = await SYNC.syncNow();
          toast(okd ? "Đã kết nối và gộp tiến độ!" : "Đồng bộ lỗi — thử lại sau.");
          this.refresh();
        };
        document.getElementById("btnMergeNo").onclick = () => {
          SYNC.setCode(oldCode);
          confirmBox.classList.add("hidden");
          this.renderSync();
        };
      } else {
        const okd = await SYNC.syncNow();
        toast(okd ? "Đã kết nối!" : "Đồng bộ lỗi — thử lại sau.");
        this.refresh();
      }
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
      rate = this.el("setRate"), npd = this.el("setNewPerDay"),
      vmode = this.el("setVoiceMode");
    reps.value = s.reps; gap.value = s.gap; rate.value = s.rate; npd.value = s.newPerDay;
    vmode.value = s.voiceMode || "mix";
    const out = () => {
      this.el("repsOut").textContent = reps.value;
      this.el("gapOut").textContent = gap.value;
      this.el("rateOut").textContent = Number(rate.value).toFixed(2) + "×";
    };
    out();
    const apply = () => {
      s.reps = +reps.value; s.gap = +gap.value; s.rate = +rate.value;
      s.newPerDay = Math.max(0, +npd.value || 0);
      s.voiceMode = vmode.value;
      Store.data.settingsAt = Date.now();
      Store.save(); out();
    };
    reps.oninput = apply; gap.oninput = apply; rate.oninput = apply; npd.onchange = apply;
    vmode.onchange = apply;

    this.el("btnTestEn").onclick = () => {
      const v = TTS.enVoiceFor(this._testIdx = (this._testIdx || 0) + 1);
      TTS.speak("analysis", "en-US", s.rate, v);
    };
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
    this.renderProgress();
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
