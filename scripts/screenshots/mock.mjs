// The mock home of the screenshots and animations: an office computer seen by System Bridge (loads, clocks,
// temperatures, memory, two disks, boot time, active user, online sensor) with HASS.Agent-like buttons (lock, sleep,
// restart, shut down, wake), and the recorder's last 24 hours of its loads. The clock is fixed (15:30 on a June day),
// so that a capture only changes when the card does.
const st = (entity_id, state, attributes = {}, changed = "2026-06-21T13:05:00") => ({ entity_id, state, attributes, last_changed: new Date(changed).toISOString() });
export const NOW = new Date(2026, 5, 21, 15, 30).getTime();

// `scene`: on, locked, sleep, off.
const SCENES = {
  on: { online: "on", state: "Active", cpu: 34, gpu: 12, ram: 58 },
  locked: { online: "on", state: "Locked", cpu: 6, gpu: 2, ram: 41 },
  sleep: { online: "off", state: "Sleep", cpu: null },
  off: { online: "off", state: "Powered off", cpu: null },
};

// The page's clock and the card's callWS, as script source: window.Date fixed at NOW, window.__ws answering the
// history from the data put on the hass object (`this.__ws`).
export const pageScript = `(() => {
  const N = ${NOW};
  const R = Date;
  window.Date = class extends R {
    constructor(...a) { super(...(a.length ? a : [N])); }
    static now() { return N; }
  };
  window.__ws = async function (msg) {
    if (msg.type === "history/history_during_period") return (this.__ws || {}).history ?? null;
    return null;
  };
})();`;

// A day of a load: a base, a busy morning and afternoon, a little noise, the same at every run.
const day = (base, busy, phase) =>
  Array.from({ length: 96 }, (_, i) => {
    const h = i / 4;
    const work = (h > 8.5 && h < 12.5) || (h > 13.5 && h < 15.5) ? busy : 0;
    return Math.max(1, Math.min(99, Math.round(base + work + 6 * Math.sin(i * 0.9 + phase) + 4 * Math.sin(i * 0.37))));
  });

export const setup = (s) => {
  const v = SCENES[s.scene];
  const on = v.cpu != null;
  const id = (x) => `sensor.office_pc_${x}`;
  const val = (x) => (on ? String(x) : "unavailable");
  const states = {
    [id("cpu_load")]: st(id("cpu_load"), val(v.cpu), { unit_of_measurement: "%", friendly_name: "Office PC CPU load" }),
    [id("cpu_speed")]: st(id("cpu_speed"), val(4.2), { unit_of_measurement: "GHz", device_class: "frequency", friendly_name: "Office PC CPU speed" }),
    [id("cpu_temperature")]: st(id("cpu_temperature"), val(52), { unit_of_measurement: "°C", device_class: "temperature", friendly_name: "Office PC CPU temperature" }),
    [id("gpu_load")]: st(id("gpu_load"), val(v.gpu), { unit_of_measurement: "%", friendly_name: "Office PC GPU load" }),
    [id("gpu_clock")]: st(id("gpu_clock"), val(1140), { unit_of_measurement: "MHz", device_class: "frequency", friendly_name: "Office PC GPU clock" }),
    [id("gpu_temperature")]: st(id("gpu_temperature"), val(41), { unit_of_measurement: "°C", device_class: "temperature", friendly_name: "Office PC GPU temperature" }),
    [id("memory_used_percentage")]: st(id("memory_used_percentage"), val(v.ram), { unit_of_measurement: "%", friendly_name: "Office PC Memory used percentage" }),
    [id("memory_used")]: st(id("memory_used"), val(on ? ((v.ram / 100) * 32).toFixed(2) : 0), { unit_of_measurement: "GiB", device_class: "data_size", friendly_name: "Office PC Memory used" }),
    [id("boot_time")]: st(id("boot_time"), on ? new Date(NOW - (2 * 24 + 4) * 3600e3 - 17 * 60e3).toISOString() : "unavailable", { device_class: "timestamp", friendly_name: "Office PC Boot time" }),
    [id("active_user")]: st(id("active_user"), on ? "user" : "unavailable", { friendly_name: "Office PC Active user" }),
    [id("session_state")]: st(id("session_state"), v.state, { friendly_name: "Office PC Session state" }, "2026-06-21T12:41:00"),
    [id("disk_c_usage")]: st(id("disk_c_usage"), "71", { unit_of_measurement: "%", friendly_name: "Office PC Disk C: usage" }),
    [id("disk_c_free")]: st(id("disk_c_free"), "339.6", { unit_of_measurement: "GiB", device_class: "data_size", friendly_name: "Office PC Disk C: free" }),
    [id("disk_d_usage")]: st(id("disk_d_usage"), "38", { unit_of_measurement: "%", friendly_name: "Office PC Disk D: usage" }),
    [id("disk_d_free")]: st(id("disk_d_free"), "1184", { unit_of_measurement: "GiB", device_class: "data_size", friendly_name: "Office PC Disk D: free" }),
    "binary_sensor.office_pc_online": st("binary_sensor.office_pc_online", v.online, { device_class: "connectivity", friendly_name: "Office PC Online" }, "2026-06-21T12:41:00"),
  };
  for (const b of ["lock", "sleep", "restart", "shutdown", "wake"]) states[`button.office_pc_${b}`] = st(`button.office_pc_${b}`, "unknown", { friendly_name: `Office PC ${b}` });
  const entities = Object.fromEntries(Object.keys(states).map((x) => [x, { entity_id: x, device_id: "office", platform: x.startsWith("button") ? "hass_agent" : "system_bridge" }]));
  const series = (vals) => vals.map((value, i) => ({ s: String(value), lu: (NOW - 864e5 + i * 9e5) / 1000 }));
  return {
    hass: {
      language: "en",
      locale: { language: "en" },
      areas: { office: { area_id: "office", name: "Office" } },
      devices: { office: { name: "Office PC", area_id: "office", model: "Windows 11" } },
      entities,
      states,
      __ws: { history: { [id("cpu_load")]: series(day(14, 26, 0)), [id("gpu_load")]: series(day(6, 8, 2)), [id("memory_used_percentage")]: series(day(44, 12, 4)) } },
    },
    config: { entity: id("cpu_load"), ...s.config },
    open: s.open,
  };
};
