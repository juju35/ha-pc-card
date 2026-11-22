import assert from "node:assert/strict";
import { test } from "node:test";
import { makeHass, NOW, st } from "./hass.mjs";
import { fakeNode, load } from "./load.mjs";

const pc = load({ now: NOW });
const { cards } = pc;
const json = (v) => JSON.parse(JSON.stringify(v));
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
};

// A card whose shadow root answers every selector with nodes recording their click listeners; the last 24 hours
// fetched (callWS) before the test reads it.
const make = async (tag, scene = "on", config = {}, overrides = {}) => {
  const { hass, config: base } = makeHass(scene, overrides);
  const card = new cards[tag]();
  card.attachShadow();
  const nodes = {};
  card.shadowRoot.querySelector = (s) => (nodes[s] ||= fakeNode());
  card._nodes = nodes;
  card.setConfig({ type: `custom:${tag}`, ...base, ...config });
  card.hass = hass;
  await settle();
  return card;
};
const click = (card, sel) => card._nodes[sel].listeners.click({ stopPropagation() {} });

test("both cards are registered, with their editors and a picker entry", () => {
  for (const tag of ["pc-card", "pc-mini-card"]) {
    assert.ok(pc.customElements.get(tag), tag);
    assert.ok(pc.customElements.get(`${tag}-editor`), `${tag}-editor`);
  }
  assert.deepEqual(json(pc.window.customCards.map((c) => c.type)), ["pc-card", "pc-mini-card"]);
});

test("discovery: the roles on the computer's device, the disks with their free space; overrides win", () => {
  const { hass } = makeHass("on");
  assert.deepEqual(json(pc.pcDevices(hass)), ["office"]);
  const r = pc.pcFind(hass, "sensor.office_pc_cpu_load");
  const expect = {
    cpu: "sensor.office_pc_cpu_load",
    cpu_speed: "sensor.office_pc_cpu_speed",
    cpu_temp: "sensor.office_pc_cpu_temperature",
    gpu: "sensor.office_pc_gpu_load",
    gpu_speed: "sensor.office_pc_gpu_clock",
    gpu_temp: "sensor.office_pc_gpu_temperature",
    ram: "sensor.office_pc_memory_used_percentage",
    ram_used: "sensor.office_pc_memory_used",
    uptime: "sensor.office_pc_boot_time",
    user: "sensor.office_pc_active_user",
    state: "sensor.office_pc_session_state",
    online: "binary_sensor.office_pc_online",
    lock: "button.office_pc_lock",
    sleep: "button.office_pc_sleep",
    restart: "button.office_pc_restart",
    shutdown: "button.office_pc_shutdown",
    wake: "button.office_pc_wake",
  };
  for (const [k, v] of Object.entries(expect)) assert.equal(r[k], v, k);
  assert.deepEqual(json(r.disks), [
    { id: "sensor.office_pc_disk_c_usage", key: "c", free: "sensor.office_pc_disk_c_free" },
    { id: "sensor.office_pc_disk_d_usage", key: "d", free: "sensor.office_pc_disk_d_free" },
  ]);
  assert.equal(pc.pcFind(hass, "sensor.office_pc_cpu_load", null, { cpu: "sensor.other" }).cpu, "sensor.other");
  assert.deepEqual(json(cards["pc-card"].getStubConfig(hass)), { entity: "sensor.office_pc_cpu_load" });
});

test("sizes in base 1024, from decimal and binary units; the history in slots", () => {
  const fmt = (v, d) => v.toFixed(d);
  assert.equal(pc.pcBytes(st("sensor.x", "2", { unit_of_measurement: "GB" })), 2e9);
  assert.equal(pc.pcBytes(st("sensor.x", "2", { unit_of_measurement: "GiB" })), 2 * 1024 ** 3);
  assert.equal(pc.pcSize(18.56 * 1024 ** 3, fmt), "18.6 GiB");
  assert.equal(pc.pcSize(1184 * 1024 ** 3, fmt), "1.16 TiB");
  assert.equal(pc.pcSize(340 * 1024 ** 3, fmt), "340 GiB");
  assert.deepEqual(json(pc.pcSeries([{ t: 0, v: 10 }, { t: 1, v: 30 }, { t: 5, v: 50 }], 0, 8, 4)), [20, 30, 50, 50], "an empty slot carries the last value");
});

test("full card on: the session, the bars with their last 24 hours, the disks", async () => {
  const card = await make("pc-card", "on");
  const m = card._items;
  assert.equal(m.state, "on");
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /<span class="bpt">On<\/span>/);
  assert.match(html, /<div class="subt">Office · Windows 11<\/div>/);
  assert.match(html, /<span class="wn">user<\/span><span class="ws">signed in · up 2 d 4 h<\/span>/);
  for (const k of ["lock", "sleep", "restart", "shutdown"]) assert.match(html, new RegExp(`data-k="${k}"`), k);
  assert.doesNotMatch(html, /data-k="wake"/);
  assert.match(html, /<b>34%<\/b> <span>4\.2 GHz<\/span>/);
  assert.match(html, /<b>12%<\/b> <span>1\.1 GHz<\/span>/);
  assert.match(html, /<b>58%<\/b> <span>18\.6 GiB<\/span>/);
  assert.match(html, /52 °C CPU · 41 °C GPU/);
  assert.equal((html.match(/class="cv"/g) || []).length, 3, "the last 24 hours behind the three bars");
  assert.match(html, /fill-opacity="\.12"/);
  assert.match(html, /stroke-opacity="\.5"/);
  assert.match(html, /<span>C:<\/span>[\s\S]*340 GiB free/);
  assert.match(html, /1\.16 TiB free/);
});

test("asleep and off: the wake button, since when, no loads", async () => {
  const sleep = await make("pc-card", "sleep");
  assert.equal(sleep._items.state, "sleep");
  assert.match(sleep.shadowRoot.innerHTML, /asleep since 2 h 25 min/);
  assert.match(sleep.shadowRoot.innerHTML, /data-k="wake"/);
  assert.match(sleep.shadowRoot.innerHTML, /<b>—<\/b>/);
  const off = await make("pc-card", "off");
  assert.equal(off._items.state, "off");
  assert.match(off.shadowRoot.innerHTML, /off since/);
  const locked = await make("pc-card", "locked");
  assert.equal(locked._items.state, "locked");
  assert.match(locked.shadowRoot.innerHTML, /<span class="ws">locked · up/);
});

test("actions: lock at once; shut down after the confirmation; wake on LAN without a wake button", async () => {
  const card = await make("pc-card", "on");
  const h = card._hass;
  click(card, '[data-k="lock"]');
  assert.deepEqual(json(h.calls.at(-1)), ["button", "press", { entity_id: "button.office_pc_lock" }]);
  click(card, '[data-k="shutdown"]');
  assert.equal(h.calls.length, 1, "asked first");
  assert.match(card.shadowRoot.innerHTML, /class="ask"[\s\S]*Shut down Office PC\? Unsaved work may be lost\./);
  card._nodes = {};
  card.shadowRoot.querySelector = (s) => (card._nodes[s] ||= fakeNode());
  card._sig = null;
  card._render();
  click(card, '[data-k="confirm"]');
  assert.deepEqual(json(h.calls.at(-1)), ["button", "press", { entity_id: "button.office_pc_shutdown" }]);
  assert.equal(card._ask, null);
  // Off, with no wake button but a MAC address: Wake on LAN.
  const off = await make("pc-card", "off", { mac: "aa:bb:cc:dd:ee:ff", entities: { wake: "button.none" } });
  click(off, '[data-k="wake"]');
  assert.deepEqual(json(off._hass.calls.at(-1)), ["wake_on_lan", "send_magic_packet", { mac: "aa:bb:cc:dd:ee:ff" }]);
  // confirm: false shuts down at once.
  const now = await make("pc-card", "on", { confirm: false });
  click(now, '[data-k="shutdown"]');
  assert.deepEqual(json(now._hass.calls.at(-1)), ["button", "press", { entity_id: "button.office_pc_shutdown" }]);
});

test("the history is fetched once for the three loads", async () => {
  const card = await make("pc-card", "on");
  const req = card._hass.ws.filter((w) => w.type === "history/history_during_period");
  assert.equal(req.length, 1);
  assert.deepEqual(json(req[0].entity_ids), ["sensor.office_pc_cpu_load", "sensor.office_pc_gpu_load", "sensor.office_pc_memory_used_percentage"]);
});

test("mini card: the CPU ring, the chips, and the zoom to the full card", async () => {
  const card = await make("pc-mini-card", "on");
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /<ha-card class="lvl-on bn">/);
  assert.match(html, /class="ringb"/);
  assert.match(html, />CPU 34%</);
  assert.match(html, />RAM 58%</);
  const off = await make("pc-mini-card", "off");
  assert.match(off.shadowRoot.innerHTML, /off since/);
  card._zoomed = true;
  card._sig = null;
  card._render();
  assert.match(card.shadowRoot.innerHTML, /class="bars"/);
});

test("no computer: says so", async () => {
  const card = await make("pc-card", "on", { entity: undefined }, { entities: {}, states: {}, devices: {} });
  assert.equal(card._items.state, "none");
  assert.match(card.shadowRoot.innerHTML, /No computer found/);
});

test("the dark theme", async () => {
  const card = await make("pc-card", "on", {}, { themes: { darkMode: true } });
  assert.match(card.shadowRoot.innerHTML, /<ha-card class="lvl-on dk">/);
  assert.match(card.shadowRoot.innerHTML, /class="banner night"/);
});

test("translations: every language has every English key", () => {
  const en = Object.keys(pc.PC_I18N.en);
  for (const [lang, table] of Object.entries(pc.PC_I18N)) assert.deepEqual(en.filter((k) => !(k in table)), [], lang);
  assert.equal(Object.keys(pc.PC_I18N).length, 22);
});

test("the editor writes only what differs from the defaults", () => {
  const ed = new (pc.customElements.get("pc-card-editor"))();
  ed.setConfig({ type: "custom:pc-card" });
  ed.hass = makeHass("on").hass;
  const form = ed.children[0];
  const names = form.schema.flatMap((s) => (s.schema ? s.schema.map((x) => x.name) : [s.name]));
  for (const n of ["entity", "mac", "broadcast_address", "show_history", "show_disks", "show_controls", "confirm", "illustration_theme", "entities", "language"]) assert.ok(names.includes(n), n);
  let out;
  ed.dispatchEvent = (e) => {
    out = e.detail.config;
  };
  form.listeners["value-changed"]({ detail: { value: { type: "custom:pc-card", confirm: true, show_disks: true, entity: "sensor.office_pc_cpu_load" } } });
  assert.deepEqual(json(out), { type: "custom:pc-card", entity: "sensor.office_pc_cpu_load" });
});
