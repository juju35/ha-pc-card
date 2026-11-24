// ── Mini card ────────────────────────────────────────────────────────────────
// The computer on two lines: a ring with the CPU load as the badge, the title and the state, then the CPU and the RAM
// as chips; the zoom button opens the full card in place.
import { PcCard } from "./card.js";
import { PC_BOOLEANS, PC_HELPERS, pcSchema } from "./editor.js";

export class PcMiniCard extends rcMini(
  PcCard,
  "pc-mini-card",
  `
    .ringb { width: 40px; height: 40px; }
  `,
) {
  getCardSize() {
    return this._zoomed ? super.getCardSize() : 1;
  }

  _drawMini(m) {
    const night = this._night();
    if (!this._changed(["mini", m.state, m.name, m.cpu == null ? null : Math.round(m.cpu), m.ram == null ? null : Math.round(m.ram), m.since, night, this._dark()])) return;
    const status = this._t(`st_${m.state === "none" ? "offline" : m.state}`);
    // A chip opens its sensor; one without a sensor is text alone, never a button that does nothing.
    const chip = (text, id) => (id ? `<button class="r" data-id="${rcEsc(id)}" title="${rcEsc(text)}"><span>${rcEsc(text)}</span></button>` : `<span class="r" title="${rcEsc(text)}"><span>${rcEsc(text)}</span></span>`);
    const chips = m.none
      ? chip(this._t("no_pc"))
      : m.awake
        ? [m.cpu != null && chip(this._t("chip_cpu", { v: this._pct(m.cpu) }), m.ids.cpu), m.ram != null && chip(this._t("chip_ram", { v: this._pct(m.ram) }), m.ids.ram)].filter(Boolean).join("")
        : m.since
          ? chip(this._t(m.state === "sleep" ? "asleep_since" : "off_since", { t: this._since(m.since) }))
          : "";
    // The ring around the badge: the CPU load (no arc at 0 %: a round cap would still draw a dot).
    const pct = m.cpu != null ? Math.min(100, Math.max(0, m.cpu)) : 0;
    const L = 2 * Math.PI * 17;
    const ring = `<svg class="ringb" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="color-mix(in srgb, var(--c) 18%, transparent)" stroke-width="4"/>${pct > 0 ? `<circle cx="20" cy="20" r="17" fill="none" stroke="var(--c)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${((L * pct) / 100).toFixed(1)} 999" transform="rotate(-90 20 20)"/>` : ""}</svg>`;
    const c = this._config;
    this.shadowRoot.innerHTML = `<style>${RC_BASE_STYLES}${this.constructor.styles}</style>
      <ha-card class="lvl-${m.state} bn${this._dark() ? " dk" : ""}">${this._banner(m, chips ? `<div class="rs">${chips}</div>` : "", ring, m.none ? "" : status)}</ha-card>`;
    const root = this.shadowRoot;
    if (c.navigation_path) rcBindNav(root.querySelector(".head"), c.navigation_path);
    for (const el of root.querySelectorAll(".r[data-id]")) el.addEventListener("click", () => rcMoreInfo(this, el.dataset.id));
    this._fitPill();
  }
}

export const PcMiniCardEditor = rcEditor({ card: PcMiniCard, helpers: PC_HELPERS, schema: pcSchema([...PC_BOOLEANS, "zoom"]) });

rcRegister(PcMiniCard, PcMiniCardEditor, "PC Mini Card", "The computer on two lines: its CPU load as a ring, its state, CPU and RAM, with a zoom to the full card");
