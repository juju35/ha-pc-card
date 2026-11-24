// ── Banner ───────────────────────────────────────────────────────────────────
// The illustrated header's scene: 200 × 80, drawn to the banner's right edge. A desk with the monitor and the tower,
// a plant, a lamp and a picture on the wall. On, the screen shows a chart that scrolls and the tower's light is green;
// asleep, the screen is dark with a moon and the light breathes amber; off, both are dark. By night (the dark theme)
// the room darkens and the lamp is lit.
import { PC_LOOP } from "./core.js";

export const pcScene = ({ night, state, animate, uid }) => {
  const on = state === "on" || state === "locked";
  const desk = night ? "#4a3a2e" : "#8a6a50";
  const frame = night ? "#3a4256" : "#c8cfdb";
  const screen = on ? (state === "locked" ? "#2b3a6b" : "#4263eb") : state === "sleep" ? "#1d2436" : "#0f131c";
  const scroll = animate && state === "on" ? `<animate attributeName="stroke-dashoffset" from="0" to="-16" dur="${PC_LOOP}s" repeatCount="indefinite"/>` : "";
  const breathe = animate && state === "sleep" ? `<animate attributeName="opacity" values=".35;1;.35" dur="${PC_LOOP}s" repeatCount="indefinite"/>` : "";
  const content =
    state === "on"
      ? `<path d="M66 52 L74 46 L82 50 L90 41 L98 45 L106 38 L114 43" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" stroke-dasharray="8 0" opacity=".9">${scroll}</path>`
      : state === "locked"
        ? `<rect x="85" y="42" width="8" height="7" rx="1" fill="#fff" opacity=".85"/><path d="M86.5 42v-2a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="#fff" stroke-width="1.3" opacity=".85"/>`
        : state === "sleep"
          ? `<circle cx="89" cy="45" r="4.5" fill="#c9d3ff" opacity=".7"/><circle cx="91" cy="43.5" r="4" fill="${screen}"/>`
          : "";
  const led = on ? "#51cf66" : state === "sleep" ? "#ffa94d" : null;
  return `<defs><linearGradient id="g${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <rect x="120" y="8" width="44" height="30" rx="3" fill="${night ? "#2a3142" : "#fff"}" stroke="${frame}"/>
    <rect x="126" y="13" width="14" height="10" rx="1" fill="${night ? "#3b4a6e" : "#d6e4ff"}"/><rect x="144" y="13" width="14" height="10" rx="1" fill="${night ? "#6e5236" : "#ffe3c2"}"/>
    <rect x="28" y="64" width="160" height="4" rx="1" fill="${desk}"/>
    <g class="monitor"><rect x="60" y="30" width="58" height="34" rx="3" fill="#1f2a44"/>
      <rect x="63" y="33" width="52" height="26" rx="1" fill="${screen}" opacity="${on ? 0.9 : 1}"/>
      ${on ? `<rect x="63" y="33" width="52" height="26" rx="1" fill="url(#g${uid})"/>` : ""}${content}
      <rect x="85" y="59" width="8" height="5" fill="#1f2a44"/></g>
    <g class="tower"><rect x="124" y="28" width="20" height="36" rx="2" fill="#2b3550"/>
      ${led ? `<circle cx="134" cy="34" r="1.8" fill="${led}">${breathe}</circle>` : `<circle cx="134" cy="34" r="1.8" fill="#3d465c"/>`}
      <rect x="128" y="40" width="12" height="1.5" fill="#5c6a8a"/><rect x="128" y="44" width="12" height="1.5" fill="#5c6a8a"/></g>
    <rect x="40" y="54" width="10" height="10" rx="2" fill="${night ? "#3a4256" : "#fff"}" stroke="${frame}"/>
    <path d="M45 54 C40 44 36 46 38 40 M45 54 C50 44 54 46 52 40 M45 54 L45 42" stroke="#5aa86b" stroke-width="2" fill="none"/>
    ${night ? `<path d="M172 40 L160 64 L196 64Z" fill="#ffd43b" opacity=".16"/>` : ""}
    <path d="M162 64 L170 40 L182 36" stroke="#55607a" stroke-width="2" fill="none"/><path d="M178 32 L190 38 L184 44 Z" fill="${night ? "#ffe066" : "#ffd43b"}"/>`;
};

// The status pill's place, decided by measurement after each render and each new width (the same rule on every
// card): on the title row, right after the title, only when the whole title and the pill's whole label fit there;
// otherwise on its own line under the subtitle (clamped to one line). When the label is still cut there, or the text
// block leaves the banner or runs over its ground strip, the pill keeps its dot alone, on the title row (its label
// stays in title and aria-label). A card of 200 px or less shows the dot alone anyway (CSS), beside the title.
export const pcPlacePill = (head, row, ground) => {
  if (!head) return;
  head.removeAttribute("data-wrap");
  head.removeAttribute("data-dot");
  const pill = row.querySelector(":scope > .bpill, :scope > .pill");
  const text = pill?.querySelector(".bpt, .pt");
  if (!text?.getBoundingClientRect || text.getBoundingClientRect().width <= 1) return;
  const name = row.querySelector(".title");
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  const title = name ? (name.scrollWidth > name.clientWidth ? name.scrollWidth : name.getBoundingClientRect().width) + gap : 0;
  if (title + pill.getBoundingClientRect().width <= row.getBoundingClientRect().width + 0.5) return;
  head.setAttribute("data-wrap", "");
  const box = row.parentElement.getBoundingClientRect();
  const frame = head.getBoundingClientRect();
  const out = ground && (box.bottom > ground.getBoundingClientRect().top + 0.5 || box.top < frame.top - 0.5);
  if (text.scrollWidth > text.clientWidth + 0.5 || out) {
    head.removeAttribute("data-wrap");
    head.setAttribute("data-dot", "");
  }
};
