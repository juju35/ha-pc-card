/**
 * pc-card / pc-mini-card: a computer. Its state, CPU, GPU and RAM with their last 24 hours, its disks, the signed-in
 * user and the uptime, and the buttons to lock it, put it to sleep, shut it down, restart or wake it (with a
 * confirmation at the top of the card).
 * https://github.com/juju35/ha-pc-card
 */

// The badge's icon of each state (its colour is the stylesheet's).
export const PC_ICONS = { on: "mdi:desktop-tower-monitor", locked: "mdi:monitor-lock", sleep: "mdi:power-sleep", off: "mdi:power-off", none: "mdi:desktop-tower-monitor" };
// One loop of the banner's animations (s): the chart on the screen scrolls by one step; asleep, the light breathes.
export const PC_LOOP = 2.4;
// How often the last 24 hours are fetched again (ms).
export const PC_REFRESH = 10 * 60 * 1000;
export const PC_COLORS = { cpu: "#4263eb", gpu: "#7048e8", ram: "#1098ad", disk: "#e8590c" };
export const PC_SVG = {
  cpu: '<path d="M9 3v2H7a2 2 0 0 0-2 2v2H3v2h2v2H3v2h2v2a2 2 0 0 0 2 2h2v2h2v-2h2v2h2v-2h2a2 2 0 0 0 2-2v-2h2v-2h-2v-2h2V9h-2V7a2 2 0 0 0-2-2h-2V3h-2v2h-2V3M7 7h10v10H7z"/>',
  gpu: '<path d="M2 7v1.5h1V17h1.5V7H2m4 0v9h1v1h7v-1h8V7H6m11.5 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"/>',
  ram: '<path d="M17 17H7V7h10m4 4V9h-2V7a2 2 0 0 0-2-2h-2V3h-2v2h-2V3H9v2H7a2 2 0 0 0-2 2v2H3v2h2v2H3v2h2v2a2 2 0 0 0 2 2h2v2h2v-2h2v2h2v-2h2a2 2 0 0 0 2-2v-2h2v-2h-2v-2m-6 2h-2v-2h2m2-2H9v6h6V9z"/>',
  disk: '<path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m6 2a6 6 0 0 0-6 6c0 3.3 2.7 6 6.1 6l-.9-2.2a1 1 0 0 1 .4-1.4l.9-.5a1 1 0 0 1 1.4.4l1.9 2.4A6 6 0 0 0 18 10a6 6 0 0 0-6-6m0 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>',
  user: '<path d="M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8m0 10c4.4 0 8 1.8 8 4v2H4v-2c0-2.2 3.6-4 8-4z"/>',
  lock: '<path d="M12 17a2 2 0 0 0 2-2c0-1.1-.9-2-2-2a2 2 0 0 0 0 4m6-9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10c0-1.1.9-2 2-2h1V6a5 5 0 0 1 10 0v2h1m-6-5a3 3 0 0 0-3 3v2h6V6a3 3 0 0 0-3-3z"/>',
  sleep: '<path d="M18.7 18A9 9 0 0 1 6 18.6 9 9 0 0 1 11.3 3a9 9 0 0 0 .7 12.7A9 9 0 0 0 18 18h.7z"/>',
  shutdown: '<path d="M16.6 5.4l-1.5 1.5A6 6 0 0 1 12 18a6 6 0 0 1-3.1-11.1L7.4 5.4A8 8 0 0 0 12 20a8 8 0 0 0 4.6-14.6M13 3h-2v10h2"/>',
  restart: '<path d="M12 4C14.1 4 16.1 4.8 17.6 6.3 20.7 9.4 20.7 14.5 17.6 17.6 15.8 19.5 13.3 20.2 10.9 19.9L11.4 17.9C13.1 18.1 14.9 17.5 16.2 16.2 18.5 13.9 18.5 10.1 16.2 7.7 15.1 6.6 13.5 6 12 6V10.6L7 5.6 12 .6V4M6.3 17.6C3.7 15 3.3 11 5.1 7.9L6.6 9.4C5.5 11.6 5.9 14.4 7.8 16.2 8.3 16.7 8.9 17.1 9.6 17.4L9 19.4C8 19 7.1 18.4 6.3 17.6Z"/>',
  wake: '<path d="M16.6 5.4l-1.5 1.5A6 6 0 0 1 12 18a6 6 0 0 1-3.1-11.1L7.4 5.4A8 8 0 0 0 12 20a8 8 0 0 0 4.6-14.6M13 3h-2v10h2"/>',
};
export const pcIcon = (k, color = "currentColor") => `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="${color}">${PC_SVG[k]}</g></svg>`;
