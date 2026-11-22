// Renders the PC cards with a mock computer and saves the README screenshots.
// Usage: npm install && npm run build && node scripts/screenshots/pc.mjs
import { pair, shoot } from "./harness.mjs";
import { pageScript, setup } from "./mock.mjs";

// Stills: animations: false stops the screen's chart and the breathing light, so a capture only changes when the card does.
const still = (file, s) => pair(file, { ...s, config: { animations: false, ...s.config } });
const shots = [
  ...["on", "locked", "sleep", "off"].flatMap((scene) => still(scene, { scene })),
  ...still("confirm", { scene: "on", open: '[data-k="shutdown"]' }),
  ...still("narrow", { scene: "on", width: 300 }),
];
await shoot({ prefix: "pc", tag: "pc-card", shots, setup, ws: pageScript });
await shoot({ prefix: "pc-mini", tag: "pc-mini-card", shots: [...still("on", { scene: "on" }), ...still("sleep", { scene: "sleep" }), ...still("zoom", { scene: "on", open: ".zoom" })], setup, ws: pageScript });
