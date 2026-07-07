/* ============================================================
   Đồng bộ tiến độ đa thiết bị qua Supabase.
   Bảo mật bằng "mã đồng bộ" bí mật (không cần đăng nhập):
   server chỉ trả dữ liệu khi biết đúng mã, không liệt kê được.
   ============================================================ */

const SYNC = {
  url: "https://ivcqqhofayvssammkini.supabase.co",
  key: "sb_publishable_C6Pg0v35A6AVp0Pd8--Z5Q_r_t3nYZr",
  codeKey: "engdrive.synccode",
  lastKey: "engdrive.synclast",
  dirty: false,
  pushTimer: null,
  status: "off", // off | ok | error | syncing
  onStatus: null,

  get code() { return localStorage.getItem(this.codeKey) || ""; },
  setCode(v) {
    if (v) localStorage.setItem(this.codeKey, v.trim());
    else localStorage.removeItem(this.codeKey);
  },
  newCode() {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    let s = "";
    for (let i = 0; i < 16; i++) {
      s += chars[buf[i] % chars.length];
      if (i % 4 === 3 && i < 15) s += "-";
    }
    return s;
  },

  _set(status) {
    this.status = status;
    if (this.onStatus) this.onStatus(status);
  },

  async rpc(fn, body, keepalive = false) {
    const res = await fetch(`${this.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      keepalive,
      headers: {
        "Content-Type": "application/json",
        "apikey": this.key,
        "Authorization": `Bearer ${this.key}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`sync ${fn} ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  async pull() {
    if (!this.code) return null;
    return this.rpc("get_progress", { sync_code: this.code });
  },

  async push(keepalive = false) {
    if (!this.code) return;
    await this.rpc("put_progress", { sync_code: this.code, payload: Store.data }, keepalive);
    this.dirty = false;
    localStorage.setItem(this.lastKey, String(Date.now()));
  },

  /* Trộn tiến độ từ máy khác: mỗi từ giữ bản tiến bộ hơn, log lấy max theo ngày */
  merge(remote) {
    if (!remote || typeof remote !== "object") return false;
    const L = Store.data;
    let changed = false;
    for (const [w, r] of Object.entries(remote.words || {})) {
      const l = L.words[w];
      if (!l) { L.words[w] = r; changed = true; continue; }
      // box (tiến độ SRS) quan trọng nhất; box bằng nhau thì ưu tiên stability (thước đo bộ nhớ
      // FSRS trực tiếp), rồi tới hạn ôn xa hơn, cuối cùng seen. Bên chưa có fc coi như stability -1.
      const rStab = r.fc?.stability ?? -1;
      const lStab = l.fc?.stability ?? -1;
      const better = r.box > l.box ||
        (r.box === l.box && (
          rStab > lStab ||
          (rStab === lStab && r.due > l.due) ||
          (rStab === lStab && r.due === l.due && r.seen > l.seen)
        ));
      if (better) { L.words[w] = r; changed = true; }
    }
    for (const [d, row] of Object.entries(remote.log || {})) {
      const lr = L.log[d] || (L.log[d] = { new: 0, review: 0, car: 0 });
      for (const k of ["new", "review", "car"]) {
        const v = Math.max(lr[k] || 0, row[k] || 0);
        if (v !== (lr[k] || 0)) { lr[k] = v; changed = true; }
      }
    }
    if ((remote.settingsAt || 0) > (L.settingsAt || 0)) {
      // chỉ nhận giá trị hợp lệ — file import/dữ liệu hỏng không phá được cài đặt
      const s = remote.settings || {};
      const num = (v, min, max, dflt) =>
        (typeof v === "number" && isFinite(v) && v >= min && v <= max) ? v : dflt;
      // Object.assign để giữ nguyên tham chiếu settings mà các trang đã bind;
      // trường nào bản remote không có (dữ liệu cũ) thì giữ giá trị local
      Object.assign(L.settings, {
        reps: num(s.reps, 1, 10, L.settings.reps),
        gap: num(s.gap, 1, 30, L.settings.gap),
        rate: num(s.rate, 0.5, 2, L.settings.rate),
        newPerDay: num(s.newPerDay, 0, 200, L.settings.newPerDay),
        voiceMode: (s.voiceMode === "single" || s.voiceMode === "mix") ? s.voiceMode : L.settings.voiceMode,
        shadow: typeof s.shadow === "boolean" ? s.shadow : L.settings.shadow,
        mode: (s.mode === "listen" || s.mode === "vocab") ? s.mode : L.settings.mode,
      });
      L.settingsAt = remote.settingsAt;
      changed = true;
    }
    return changed;
  },

  async syncNow() {
    if (!this.code) { this._set("off"); return false; }
    this._set("syncing");
    try {
      const remote = await this.pull();
      this.merge(remote);
      localStorage.setItem(Store.key, JSON.stringify(Store.data)); // lưu không kích hoạt markDirty
      clearTimeout(this.pushTimer); // hủy push debounce cũ để không ghi đè lẫn nhau
      this.pushTimer = null;
      await this.push();
      this._set("ok");
      return true;
    } catch (e) {
      console.warn("sync failed", e);
      this._set("error");
      return false;
    }
  },

  markDirty() {
    if (!this.code) return;
    this.dirty = true;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.push().then(() => this._set("ok")).catch(() => this._set("error"));
    }, 4000);
  },

  /* Gọi 1 lần khi trang tải: kéo về, trộn, gọi lại callback để vẽ lại UI */
  async init(onMerged) {
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && this.dirty) {
        // bảo tồn cục bộ trước — không phụ thuộc keepalive thành công
        try { localStorage.setItem(Store.key, JSON.stringify(Store.data)); } catch {}
        // keepalive bị trình duyệt bỏ nếu payload >64KB → chỉ dùng khi payload nhỏ;
        // payload lớn: vẫn dirty, lần mở tab sau hoặc từ kế tiếp sẽ push() bình thường
        if (JSON.stringify(Store.data).length < 50000) this.push(true).catch(() => {});
      }
    });
    // mạng trở lại: thử đẩy phần còn nợ
    window.addEventListener("online", () => { if (this.dirty) this.push().then(() => this._set("ok")).catch(() => {}); });
    if (!this.code) { this._set("off"); return; }
    this._set("syncing");
    try {
      const remote = await this.pull();
      const changed = this.merge(remote);
      localStorage.setItem(Store.key, JSON.stringify(Store.data));
      clearTimeout(this.pushTimer); // hủy push debounce cũ — push cuối này đã chứa dữ liệu mới nhất
      this.pushTimer = null;
      await this.push();
      this._set("ok");
      if (changed && onMerged) onMerged();
    } catch (e) {
      console.warn("sync init failed", e);
      this._set("error");
    }
  },
};
