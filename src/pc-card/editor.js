// ── Editor ───────────────────────────────────────────────────────────────────
import { PcCard } from "./card.js";

export const pcSchema = (booleans) => (lang) => [
  { name: "entity", selector: { entity: {} } },
  { name: "title", selector: { text: {} } },
  { name: "navigation_path", selector: { navigation: {} } },
  { name: "mac", selector: { text: {} } },
  { name: "broadcast_address", selector: { text: {} } },
  ...rcBooleans(...booleans),
  {
    name: "illustration_theme",
    selector: { select: { mode: "dropdown", options: ["auto", "day", "night"].map((value) => ({ value, label: rcT(PC_I18N, lang, `ed_theme_${value}`) })) } },
  },
  ...rcAdvanced(PC_I18N, lang, "entities", "language"),
];

export const PC_HELPERS = ["entity", "title", "mac", "broadcast_address", "zoom", "entities", "language"];
export const PC_BOOLEANS = ["show_title", "show_subtitle", "illustration", "show_history", "show_disks", "show_controls", "confirm", "animations"];

export const PcCardEditor = rcEditor({ card: PcCard, helpers: PC_HELPERS, schema: pcSchema(PC_BOOLEANS) });

rcRegister(PcCard, PcCardEditor, "PC Card", "A computer: state, CPU, GPU, RAM and disks with their last 24 hours, the signed-in user, and wake, lock, sleep and shut down");
