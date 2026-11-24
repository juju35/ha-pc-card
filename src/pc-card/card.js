// ── Card ─────────────────────────────────────────────────────────────────────
import { PC_COLORS, PC_ICONS, PC_REFRESH, pcIcon } from "./core.js";
import { pcPlacePill, pcScene } from "./banner.js";

export class PcCard extends RcCard {
  static tag = "pc-card";
  static i18n = PC_I18N;
  static defaults = { illustration: true, illustration_theme: "auto", show_subtitle: true, show_history: true, show_disks: true, show_controls: true, confirm: true, animations: true };

  // An entity of the first computer of the home.
  static getStubConfig(hass) {
    const dev = hass ? pcDevices(hass)[0] : undefined;
    const entity = dev && Object.keys(hass.entities).find((id) => hass.entities[id].device_id === dev && pcRole(hass, id) === "cpu");
    return entity ? { entity } : {};
  }

  getCardSize() {
    return 6;
  }

  connectedCallback() {
    super.connectedCallback?.();
    this._timer ??= setInterval(() => this._fetch(), PC_REFRESH);
    // A new width: the status pill is fitted again (in the next frame, and only for a new width).
    if (typeof ResizeObserver !== "function") return;
    this._resize ??= new ResizeObserver((entries) => {
      const w = Math.round(entries.at(-1).contentRect.width);
      if (w === this._fitWidth) return;
      this._fitWidth = w;
      cancelAnimationFrame(this._fitFrame);
      this._fitFrame = requestAnimationFrame(() => this._fitPill());
    });
    this._resize.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    clearInterval(this._timer);
    this._timer = undefined;
    // Left (another view, a conditional card hidden): a confirmation asked closes without doing anything.
    this._ask = null;
    this._resize?.disconnect();
    this._fitWidth = undefined;
    if (this._fitFrame) cancelAnimationFrame(this._fitFrame);
  }

  // The last 24 hours of the loads, from the recorder (history/history_during_period).
  async _fetch() {
    const h = this._hass;
    const ids = ["cpu", "gpu", "ram"].map((r) => this._items?.ids?.[r]).filter(Boolean);
    if (!h?.callWS || this._busy || !ids.length || this._config.show_history === false) return;
    this._busy = true;
    const now = Date.now();
    try {
      const r = await h
        .callWS({ type: "history/history_during_period", start_time: new Date(now - 864e5).toISOString(), end_time: new Date(now).toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true })
        .catch(() => null);
      const hist = {};
      for (const id of ids)
        hist[id] = pcSeries(
          (r?.[id] || []).map((x) => ({ t: x.lu != null ? x.lu * 1000 : new Date(x.last_updated || x.last_changed).getTime(), v: Number.isFinite(Number(x.s ?? x.state)) ? Number(x.s ?? x.state) : null })),
          now - 864e5,
          now,
          48,
        );
      this._hist = { at: now, ids: ids.join(), data: hist };
    } finally {
      this._busy = false;
    }
    this._sig = null;
    this._render();
  }

  _fmt(v, digits) {
    try {
      return pcIntl(Intl.NumberFormat, this._lang(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
    } catch {
      return v.toFixed(digits);
    }
  }

  _pct(v) {
    try {
      return pcIntl(Intl.NumberFormat, this._lang(), { style: "percent", maximumFractionDigits: 0 }).format(Math.round(v) / 100);
    } catch {
      return `${Math.round(v)}%`;
    }
  }

  _deg(st) {
    const v = pcNum(st);
    return v == null ? "" : `${this._fmt(v, 0)} ${st.attributes?.unit_of_measurement || "°C"}`;
  }

  // A duration since `t` (ms), in days and hours, hours and minutes, or minutes.
  _since(t) {
    const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (m >= 1440) return this._t("dur_dh", { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60) });
    if (m >= 60) return this._t("dur_hm", { h: Math.floor(m / 60), m: m % 60 });
    return this._t("dur_m", { m });
  }

  _collect() {
    const h = this._hass;
    const c = this._config;
    const e = rcMemo((this._memo ||= {}), "find", [c.entity, c.device, c.entities, h.entities], () => pcFind(h, c.entity, c.device, c.entities || {}));
    const st = (r) => (e[r] ? h.states[e[r]] : undefined);
    const ok = (s) => s && !["unavailable", "unknown"].includes(s.state);
    const dev = e.device && h.devices?.[e.device];
    const stateText = pcNorm(st("state")?.state);
    const online = st("online");
    let state;
    if (!e.device && !e.cpu) state = "none";
    else if (/sleep|suspend|standby|hibernat/.test(stateText)) state = "sleep";
    else if (/off|shut|powered_down/.test(stateText) || (ok(online) && online.state === "off")) state = "off";
    else if ((ok(online) && online.state === "on") || ok(st("cpu")) || ok(st("ram"))) state = /lock/.test(stateText) ? "locked" : "on";
    else state = "off";
    const awake = state === "on" || state === "locked";
    const changed = [online, st("cpu"), st("state")].filter(Boolean).map((s) => new Date(s.last_changed).getTime());
    const since = changed.length ? Math.max(...changed) : null;
    const uptimeSt = st("uptime");
    const boot = ok(uptimeSt) ? new Date(uptimeSt.state).getTime() : null;
    const ram = pcNum(st("ram"));
    const bar = (role, sub) => {
      const v = pcNum(st(role));
      return e[role] ? { role, id: e[role], v: awake ? v : null, sub: awake ? sub : "" } : null;
    };
    const ghz = (role) => {
      const g = pcGhz(st(role));
      return g == null ? "" : `${this._fmt(g, 1)} GHz`;
    };
    const ramUsed = pcBytes(st("ram_used"));
    const disks = (e.disks || [])
      .map((d) => ({
        id: d.id,
        // A drive letter as Windows shows it (C:), else the sensor's name without the computer's.
        name: d.key?.length === 1 ? `${d.key.toUpperCase()}:` : (h.states[d.id]?.attributes.friendly_name || d.id).replace(dev?.name || "", "").trim() || d.key,
        v: pcNum(h.states[d.id]),
        free: d.free ? pcBytes(h.states[d.free]) : null,
      }))
      .filter((d) => d.v != null);
    // A button's state is the time of its last press ("unknown" before the first one): only "unavailable" hides it.
    const btn = (r) => (e[r] && h.states[e[r]] && h.states[e[r]].state !== "unavailable" ? e[r] : null);
    return {
      none: state === "none",
      state,
      awake,
      ids: e,
      name: c.title || dev?.name_by_user || dev?.name || this._t("title"),
      sub: c.show_subtitle === false ? "" : [h.areas?.[dev?.area_id]?.name, dev?.model || dev?.sw_version].filter(Boolean).join(" · "),
      user: awake && ok(st("user")) ? st("user").state : null,
      boot,
      since,
      bars: [bar("cpu", ghz("cpu_speed")), bar("gpu", ghz("gpu_speed")), bar("ram", ramUsed != null ? pcSize(ramUsed, (v, d) => this._fmt(v, d)) : "")].filter(Boolean),
      temps: awake ? [st("cpu_temp") && this._t("temp_cpu", { t: this._deg(st("cpu_temp")) }), st("gpu_temp") && this._t("temp_gpu", { t: this._deg(st("gpu_temp")) })].filter((x) => x && !/^ /.test(x)) : [],
      cpu: awake ? pcNum(st("cpu")) : null,
      ram: awake ? ram : null,
      disks,
      actions: {
        lock: state === "on" ? btn("lock") : null,
        sleep: awake ? btn("sleep") : null,
        restart: awake ? btn("restart") : null,
        shutdown: awake ? btn("shutdown") : null,
        wake: !awake ? btn("wake") || (c.mac ? "wol" : null) : null,
      },
    };
  }

  _dark() {
    return !!this._hass.themes?.darkMode;
  }

  // The banner's night: forced by `illustration_theme`, else Home Assistant's dark theme alone.
  _night() {
    const theme = this._config.illustration_theme;
    if (theme === "night" || theme === "day") return theme === "night";
    return this._dark();
  }

  _animate() {
    if (this._config.animations === false) return false;
    try {
      return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return true;
    }
  }

  // Unique per card: the SVG ids of several cards on one page never clash.
  _id() {
    this._uid ||= Math.random().toString(36).slice(2, 8);
    return this._uid;
  }

  // The illustrated header: the badge (the state's icon, in the state's colour), the title and `sub` on the wall at
  // the left, the desk at the right, a 10 px wooden strip edge to edge. `ring`: the mini card's CPU load around the badge.
  _banner(m, sub, ring = "", pill = "") {
    const c = this._config;
    const nav = c.navigation_path;
    const night = this._night();
    const scene = pcScene({ night, state: m.state, animate: this._animate(), uid: this._id() });
    const chip = pill ? `<span class="bpill" title="${rcEsc(pill)}" aria-label="${rcEsc(pill)}"><span class="bdot"></span><span class="bpt">${rcEsc(pill)}</span></span>` : "";
    return `
      <div class="banner${night ? " night" : ""}">
        <div class="head${nav ? " nav" : ""}"${nav ? ' role="link" tabindex="0"' : ""}>
          <div class="badge">${ring}<ha-icon icon="${PC_ICONS[m.state]}"></ha-icon></div>
          <div class="tt"><div class="trow"><div class="title">${rcEsc(m.name)}</div>${chip}</div>${sub}</div>
        </div>
        <svg class="room" viewBox="0 0 200 80" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">${scene}</svg>
        <div class="ground"></div>
      </div>`;
  }

  // The status pill's place, on the banner and on the classic header (see pcPlacePill).
  _fitPill() {
    for (const row of this.shadowRoot?.querySelectorAll?.(".trow") || []) {
      const banner = row.closest(".banner");
      pcPlacePill(banner || row.closest(".head"), row, banner?.querySelector(".ground"));
    }
  }

  // The confirmation, at the top of the card under the header.
  _confirm(m) {
    if (!this._ask) return "";
    return `<div class="ask" role="alertdialog" aria-live="assertive">${pcIcon(this._ask === "sleep" ? "sleep" : "shutdown")}<span class="aq">${rcEsc(this._t(`confirm_${this._ask}`, { name: m.name }))}</span>
      <button class="ab no" data-k="cancel">${rcEsc(this._t("cancel"))}</button><button class="ab yes" data-k="confirm">${rcEsc(this._t(this._ask))}</button></div>`;
  }

  // The user, the uptime (or since when the computer is off or asleep), and the round buttons.
  _session(m) {
    const line = m.awake
      ? [m.state === "locked" ? this._t("locked") : m.user ? this._t("signed_in") : "", m.boot ? this._t("up", { t: this._since(m.boot) }) : ""].filter(Boolean).join(" · ")
      : m.since
        ? this._t(m.state === "sleep" ? "asleep_since" : "off_since", { t: this._since(m.since) })
        : "";
    const who = m.awake ? m.user || m.name : this._t(`st_${m.state}`);
    const a = m.actions;
    const show = this._config.show_controls !== false;
    const round = (k) => (a[k] ? `<button class="rb ${k}" data-k="${k}" aria-label="${rcEsc(this._t(k))}" title="${rcEsc(this._t(k))}">${pcIcon(k)}</button>` : "");
    const ctl = show
      ? m.awake
        ? ["lock", "sleep", "restart", "shutdown"].some((k) => a[k])
          ? `<span class="seg">${round("lock")}${round("sleep")}${round("restart")}${round("shutdown")}</span>`
          : ""
        : a.wake
          ? `<button class="wb" data-k="wake">${pcIcon("wake")}<span>${rcEsc(this._t("wake"))}</span></button>`
          : ""
      : "";
    return `<div class="ses"><span class="av${m.awake ? "" : " off"}">${pcIcon(m.awake ? "user" : m.state === "sleep" ? "sleep" : "shutdown")}</span>
      <div class="who"><span class="wn">${rcEsc(who)}</span>${line ? `<span class="ws">${rcEsc(line)}</span>` : ""}</div>${ctl}</div>`;
  }

  // A bar with the last 24 hours drawn behind it (0–100, the line at 50 %, the area at 12 %).
  _curve(id, color) {
    const pts = this._hist?.data?.[id];
    if (this._config.show_history === false || !pts?.some((v) => v != null)) return "";
    const n = pts.length;
    const xy = pts.map((v, i) => (v == null ? null : [((i + 0.5) / n) * 100, 22 - (Math.min(100, Math.max(0, v)) / 100) * 20]));
    const line = xy.filter(Boolean).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
    const first = xy.find(Boolean);
    const last = [...xy].reverse().find(Boolean);
    return `<svg class="cv" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true"><path d="${line.join("")} L${last[0].toFixed(1)} 22 L${first[0].toFixed(1)} 22Z" fill="${color}" fill-opacity=".12"/><path d="${line.join("")}" fill="none" stroke="${color}" stroke-opacity=".5" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  }

  _loads(m) {
    if (!m.bars.length) return "";
    const head = `<div class="bh"><span>${rcEsc(this._t(this._config.show_history === false ? "load" : "load_24h"))}</span>${m.temps.length ? `<span>${rcEsc(m.temps.join(" · "))}</span>` : ""}</div>`;
    const rows = m.bars
      .map(({ role, id, v, sub }) => {
        const col = PC_COLORS[role];
        return `<button class="br" data-id="${rcEsc(id)}"><span class="bl">${pcIcon(role, col)}<span>${rcEsc(this._t(role))}</span></span>
          <span class="bw">${this._curve(id, col)}<span class="tr"><span class="fl" style="width:${v == null ? 0 : Math.min(100, Math.max(0, v)).toFixed(1)}%;background:${col}"></span></span></span>
          <span class="bv"><b>${v == null ? "—" : rcEsc(this._pct(v))}</b>${sub ? ` <span>${rcEsc(sub)}</span>` : ""}</span></button>`;
      })
      .join("");
    return `<div class="box">${head}<div class="bars">${rows}</div></div>`;
  }

  _disks(m) {
    if (this._config.show_disks === false || !m.disks.length) return "";
    const fmt = (v, d) => this._fmt(v, d);
    const rows = m.disks
      .map(
        (d) =>
          `<button class="br dk" data-id="${rcEsc(d.id)}"><span class="bl">${pcIcon("disk", PC_COLORS.disk)}<span>${rcEsc(d.name)}</span></span><span class="bw"><span class="tr"><span class="fl" style="width:${Math.min(100, Math.max(0, d.v)).toFixed(1)}%;background:${PC_COLORS.disk}"></span></span></span><span class="bv">${d.free != null ? `<span>${rcEsc(this._t("free", { v: pcSize(d.free, fmt) }))}</span>` : `<b>${rcEsc(this._pct(d.v))}</b>`}</span></button>`,
      )
      .join("");
    return `<div class="box"><div class="bh"><span>${rcEsc(this._t("disks"))}</span></div><div class="bars">${rows}</div></div>`;
  }

  _draw(m) {
    const c = this._config;
    // The last 24 hours: fetched at first, every PC_REFRESH, and when the loads change entity.
    const ids = ["cpu", "gpu", "ram"].map((r) => m.ids[r]).filter(Boolean).join();
    if (this._hass.callWS && !this._busy && ids && (!this._hist || this._hist.ids !== ids)) this._fetch();
    const status = this._t(`st_${m.state === "none" ? "offline" : m.state}`);
    const parts = [m.state, m.name, m.sub, m.user, m.boot, m.since, m.bars, m.temps, m.disks, m.actions, this._ask, this._hist?.at, this._night(), this._dark(), Math.floor(Date.now() / 60000)];
    if (!this._changed(parts)) return;
    const subHtml = m.sub ? `<div class="subt">${rcEsc(m.sub)}</div>` : "";
    const head =
      c.illustration !== false
        ? this._banner(m, subHtml, "", m.none ? "" : status)
        : `<div class="head${c.navigation_path ? " nav" : ""}"${c.navigation_path ? ' role="link" tabindex="0"' : ""}>
            <div class="badge"><ha-icon icon="${PC_ICONS[m.state]}"></ha-icon></div>
            <div class="tt"><div class="trow"><div class="title">${rcEsc(m.name)}</div>${m.none ? "" : `<span class="pill" title="${rcEsc(status)}" aria-label="${rcEsc(status)}"><span class="pt">${rcEsc(status)}</span></span>`}</div>${subHtml}</div>
          </div>`;
    const dk = this._dark() ? " dk" : "";
    if (m.none) {
      this._paint("none", `${head}<div class="box nohr">${rcEsc(this._t("no_pc"))}</div>`, "", dk);
      this._fitPill();
      return;
    }
    this._paint(m.state, head + this._confirm(m) + this._session(m) + this._loads(m) + this._disks(m), "", dk);
    this._fitPill();
  }

  // Runs an action: a button or script, a switch (on for wake), or Wake on LAN with the configured MAC address.
  _run(k) {
    const h = this._hass;
    const id = this._items.actions[k];
    if (!id) return;
    if (id === "wol") {
      rcCall(h, "wake_on_lan", "send_magic_packet", { mac: this._config.mac, ...(this._config.broadcast_address ? { broadcast_address: this._config.broadcast_address } : {}) });
      return;
    }
    const dom = id.split(".")[0];
    if (dom === "button") rcCall(h, "button", "press", { entity_id: id });
    else if (dom === "script") rcCall(h, "script", "turn_on", { entity_id: id });
    else rcCall(h, dom, k === "wake" ? "turn_on" : "turn_off", { entity_id: id });
  }

  _bindAfter(root) {
    const ask = (k) => {
      this._ask = k;
      this._sig = null;
      this._render();
    };
    for (const k of ["lock", "sleep", "restart", "shutdown", "wake"])
      root.querySelector(`[data-k="${k}"]`)?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (this._config.confirm !== false && ["sleep", "restart", "shutdown"].includes(k)) ask(k);
        else this._run(k);
      });
    root.querySelector('[data-k="cancel"]')?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ask(null);
    });
    root.querySelector('[data-k="confirm"]')?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const k = this._ask;
      ask(null);
      this._run(k);
    });
    for (const b of root.querySelectorAll(".br[data-id]") || []) b.addEventListener("click", () => rcMoreInfo(this, b.dataset.id));
  }

  static styles = `
    ha-card.lvl-on, ha-card.lvl-locked { --c: #2f9e44; }
    ha-card.lvl-sleep { --c: #5c7cfa; }
    ha-card.lvl-off, ha-card.lvl-none { --c: var(--rc-idle); }
    :host { --pc-track: rgba(127,127,127,.18); }
    .tt { flex: 1 1 0; min-width: 5ch; display: flex; flex-direction: column; }
    .tt .title { flex: none; }
    .subt { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :host([hide-title]) .head .tt { visibility: hidden; }
    .box { margin-top: 10px; border-radius: 12px; padding: 10px 12px; background: var(--secondary-background-color, rgba(127,127,127,.08)); }
    .nohr { font-size: 13px; color: var(--secondary-text-color); }
    /* The confirmation: at the top of the card, in the alert colour. */
    .ask { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin-top: 10px; padding: 10px 12px; border-radius: 12px;
           color: color-mix(in srgb, var(--rc-alert) 60%, var(--primary-text-color, #212121));
           background: color-mix(in srgb, var(--rc-alert) 10%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rc-alert) 30%, transparent); }
    .ask > svg { flex: none; width: 20px; height: 20px; color: var(--rc-alert); }
    .aq { flex: 1 1 160px; font-size: 14px; }
    .ab { all: unset; box-sizing: border-box; cursor: pointer; min-height: 36px; padding: 0 14px; border-radius: 999px; font-size: 13px; font-weight: 500; }
    .ab.no { color: var(--primary-text-color); background: var(--card-background-color, #fff); }
    .ab.yes { color: var(--rc-alert); background: color-mix(in srgb, var(--rc-alert) 18%, transparent); }
    .ab:focus-visible, .rb:focus-visible, .wb:focus-visible, .br:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    .ses { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
    .av { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: #4263eb; background: color-mix(in srgb, #4263eb 14%, transparent); }
    .av.off { color: var(--rc-idle); background: color-mix(in srgb, var(--rc-idle) 14%, transparent); }
    .av svg { width: 20px; height: 20px; }
    .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .wn { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ws { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .seg { flex: none; display: inline-flex; gap: 2px; padding: 2px; border-radius: 999px; background: var(--secondary-background-color, rgba(127,127,127,.1)); }
    .rb { all: unset; box-sizing: border-box; cursor: pointer; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; color: #3b5bdb; }
    .rb svg { width: 18px; height: 18px; }
    .rb:hover { background: color-mix(in srgb, #3b5bdb 12%, transparent); }
    .rb.shutdown { color: var(--rc-alert); background: color-mix(in srgb, var(--rc-alert) 12%, transparent); }
    .wb { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 16px; border-radius: 999px;
          font-size: 14px; font-weight: 500; color: color-mix(in srgb, #2f9e44 55%, var(--primary-text-color, #212121)); background: color-mix(in srgb, #2f9e44 15%, transparent); }
    .wb svg { width: 18px; height: 18px; }
    .bh { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px; }
    .bh span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bars { display: flex; flex-direction: column; gap: 6px; }
    .br { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 64px minmax(0, 1fr) 96px; gap: 10px; align-items: end; border-radius: 6px; }
    .br.dk { align-items: center; }
    .bl { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; color: var(--primary-text-color); }
    .bl svg { flex: none; width: 16px; height: 16px; }
    .bl span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bw { display: flex; flex-direction: column; justify-content: flex-end; gap: 2px; min-width: 0; }
    .cv { display: block; width: 100%; height: 22px; }
    .tr { display: block; height: 8px; border-radius: 4px; overflow: hidden; background: var(--pc-track); }
    .fl { display: block; height: 100%; border-radius: 4px; }
    .bv { font-size: 13px; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bv b { font-weight: 500; color: var(--primary-text-color); }
    .bv span { color: var(--secondary-text-color); }
    .lvl-off .bars .br:not(.dk), .lvl-sleep .bars .br:not(.dk) { opacity: .55; }
    @container (max-width: 340px) {
      .br { grid-template-columns: 52px minmax(0, 1fr) 76px; gap: 8px; }
      .bv span { display: none; }
      .br.dk .bv span { display: inline; }
      .rb { width: 36px; height: 36px; }
    }
    /* Illustrated header (banner): 90 px, edge to edge, the title on the wall, the desk at the right, a 10 px wooden
       strip at the bottom. The badge's icon is in the state's colour, grey when off, by day and night. */
    .banner { position: relative; display: flex; height: 90px; margin: -12px -12px 0; overflow: hidden;
              background: linear-gradient(180deg, #eef1f8 0%, #e2e7f2 100%);
              --bt: #0d2a45; --bs: #3b5b78; --ic: color-mix(in srgb, var(--c) 85%, #10283f); --sw: min(200px, 56%); }
    .banner.night { background: linear-gradient(180deg, #1e2433 0%, #262d3f 100%); --bt: #fff; --bs: rgba(255,255,255,.78); --ic: color-mix(in srgb, var(--c) 72%, #fff); }
    .lvl-off .banner, .lvl-none .banner { --ic: #6b7680; }
    .lvl-off .banner.night, .lvl-none .banner.night { --ic: #a7b0b8; }
    .banner .head { position: relative; z-index: 1; flex: 1; min-width: 0; height: 80px; box-sizing: border-box;
                    padding: 0 calc(var(--sw) + 4px) 0 14px; flex-wrap: nowrap; }
    .banner .head::after { content: none; }
    .banner .badge { position: relative; color: var(--ic); background: rgba(255,255,255,.62); box-shadow: inset 0 0 0 1px rgba(13,42,69,.12); }
    .banner.night .badge { background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }
    .banner .title { color: var(--bt); }
    .banner .subt { color: var(--bs); font-size: 13px; }
    .banner .room { position: absolute; right: 0; bottom: 10px; width: var(--sw); height: calc(80px * var(--sk, 1)); }
    .banner .ground { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: repeating-linear-gradient(90deg, #a9876a 0 30px, #b8957a 30px 60px); }
    .banner.night .ground { background: repeating-linear-gradient(90deg, #3d3128 0 30px, #46392e 30px 60px); }
    /* The mini card's expand / collapse button: 24 px, frosted, 5 px from the banner's top right corner. */
    .banner .zoom { position: absolute; z-index: 2; top: 5px; right: 5px; width: 24px; height: 24px; margin: 0; color: #33506b;
                    background: rgba(255,255,255,.55); box-shadow: inset 0 0 0 1px rgba(255,255,255,.7); backdrop-filter: blur(4px); }
    .banner.night .zoom { color: #fff; background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.2); }
    .banner .zoom:hover { background: rgba(255,255,255,.75); color: #33506b; }
    .banner.night .zoom:hover { background: rgba(255,255,255,.22); color: #fff; }
    .banner .tt { min-width: 0; flex: 1 1 auto; }
    /* Status pill right after the title (see pcPlacePill). */
    .trow { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .trow > .title { flex: 0 1 auto; min-width: 0; }
    .trow > .bpill, .trow > .pill { flex: none; max-width: none; }
    :host([hide-title]) .trow .title { visibility: hidden; }
    .head:has(.trow) { flex-wrap: nowrap; }
    .head:has(.trow)::after { content: none; }
    .bpill { display: inline-flex; align-items: center; gap: 4px; min-width: 0; box-sizing: border-box; overflow: hidden;
             white-space: nowrap; padding: 1px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; line-height: 16px;
             background: color-mix(in srgb, var(--c) 18%, rgba(255,255,255,.78)); color: color-mix(in srgb, var(--c) 45%, #0d2a45); }
    .banner.night .bpill { background: color-mix(in srgb, var(--c) 30%, rgba(8,18,38,.55)); color: color-mix(in srgb, var(--c) 35%, #ffffff); }
    .bdot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: none; }
    .bpt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    [data-wrap] .trow { display: contents; }
    [data-wrap] .trow > .bpill, [data-wrap] .trow > .pill { order: 9; align-self: flex-start; max-width: 100%; margin-top: 3px; }
    .banner[data-wrap] .trow > .bpill { max-width: calc(100cqw - 80px); }
    [data-wrap] .subt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    [data-dot] .bpill { padding: 0; background: none; }
    [data-dot] .bpt, [data-dot] .trow > .pill .pt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    [data-dot] .trow > .pill { padding: 0; width: 18px; height: 18px; justify-content: center; background: none; }
    [data-dot] .trow > .pill::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    @container (max-width: 200px) {
      .bpill { padding: 0; background: none; }
      .bpt, .trow > .pill .pt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
      .trow > .pill { padding: 0; width: 18px; height: 18px; justify-content: center; background: none; }
      .trow > .pill::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    }
    /* The mini card: the banner alone, its readings as chips on the wall. */
    ha-card.bn { padding: 0; }
    ha-card.bn > .banner { margin: 0; --sw: min(200px, 46%); }
    /* Narrower cards: the scene is drawn smaller (75 %, 62 %, then 50 % of its height, its left part cropped). */
    @container (max-width: 420px) { .banner, ha-card.bn > .banner { --sw: 150px; --sk: .75; } }
    @container (max-width: 340px) { .banner, ha-card.bn > .banner { --sw: 112px; --sk: .62; } }
    @container (max-width: 260px) { .banner, ha-card.bn > .banner { --sw: 70px; --sk: .5; } }
    /* The chips that do not fit wrap to a second line, hidden: never a chip cut to "R…". */
    .banner .rs { display: flex; flex-wrap: wrap; gap: 4px; height: 20px; margin: 3px 0 0 -2px; min-width: 0; overflow: hidden; }
    .banner .r { flex: none; line-height: 20px; padding: 0 7px; color: var(--bt); background: rgba(255,255,255,.62); }
    .banner.night .r { background: rgba(10,20,40,.4); }
    .banner span.r { cursor: default; }
    .banner .ringb { position: absolute; inset: 0; }
    /* Home Assistant's dark theme: a darker track behind the bars. */
    ha-card.dk { --pc-track: rgba(255,255,255,.1); }
  `;
}
