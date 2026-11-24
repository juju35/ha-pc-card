// ── Computer ─────────────────────────────────────────────────────────────────
// A computer is a device of System Bridge, HASS.Agent, LNXlink (MQTT) or the Home Assistant app on a Mac. Its
// entities are found on that device by what they are (domain, device class, unit) and their name: the loads, the
// temperatures and clocks, the memory, the disks, the signed-in user, the uptime, whether it is on or asleep, and the
// buttons that lock it, put it to sleep, shut it down, restart or wake it. `entities` overrides any role.
export const PC_PLATFORMS = ["system_bridge", "hass_agent", "mqtt", "mobile_app"];
export const PC_ROLES = ["cpu", "cpu_temp", "cpu_speed", "gpu", "gpu_temp", "gpu_speed", "ram", "ram_used", "user", "uptime", "online", "state", "lock", "sleep", "shutdown", "restart", "wake"];

export const pcNorm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9:]+/g, "_");
export const pcNum = (st) => {
  if (!st || ["unavailable", "unknown", ""].includes(st.state)) return null;
  const v = Number(st.state);
  return Number.isFinite(v) ? v : null;
};

// A size in bytes, from a data size sensor's unit (decimal and binary units).
export const PC_UNITS = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };
export const pcBytes = (st) => {
  const v = pcNum(st);
  const k = PC_UNITS[String(st?.attributes?.unit_of_measurement || "").toLowerCase()];
  return v == null || !k ? null : v * k;
};
// A size in base 1024 (KiB, MiB, GiB, TiB), with 2 decimals under 10, 1 under 100, none above.
export const pcSize = (bytes, fmt) => {
  if (bytes == null) return "";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${fmt(v, i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
};
// A clock in GHz, from MHz or GHz.
export const pcGhz = (st) => {
  const v = pcNum(st);
  if (v == null) return null;
  return /^mhz$/i.test(st.attributes?.unit_of_measurement || "") ? v / 1000 : v;
};

// The role of an entity of the computer, from its domain, device class, unit and name.
export const pcRole = (hass, id) => {
  const st = hass.states[id];
  const a = st?.attributes || {};
  const dom = id.split(".")[0];
  const n = pcNorm(`${hass.entities?.[id]?.translation_key || ""} ${id} ${a.friendly_name || ""}`);
  const u = String(a.unit_of_measurement || "").toLowerCase();
  const dc = a.device_class;
  const not = (re) => !re.test(n);
  if (dom === "button" || dom === "script" || dom === "switch") {
    if (/wake|wol|magic_packet/.test(n)) return "wake";
    if (/lock/.test(n) && not(/unlock/)) return "lock";
    if (/sleep|suspend|hibernat|standby/.test(n)) return "sleep";
    if (/restart|reboot/.test(n)) return "restart";
    if (/shut_?down|power_?off|poweroff/.test(n)) return "shutdown";
    return null;
  }
  if (dom === "binary_sensor") return ["connectivity", "power", "running", "plug"].includes(dc) || /online|status|power_?state|is_on/.test(n) ? "online" : null;
  if (dom !== "sensor") return null;
  if (dc === "temperature") return /gpu|graphics/.test(n) ? "gpu_temp" : /cpu|processor|package|core/.test(n) ? "cpu_temp" : null;
  if (u === "mhz" || u === "ghz") return /gpu|graphics/.test(n) ? "gpu_speed" : /cpu|processor|clock|speed|frequency/.test(n) ? "cpu_speed" : null;
  if (u === "%") {
    if (/gpu|graphics/.test(n) && not(/memory|ram|fan|temp|clock|vram/)) return "gpu";
    if (/memory|ram/.test(n) && not(/gpu|swap|virtual|vram|disk/)) return "ram";
    if (/cpu|processor|load/.test(n) && not(/temp|clock|speed|fan|power|gpu|memory|ram|disk|battery/)) return "cpu";
    return null;
  }
  if (PC_UNITS[u] && /memory|ram/.test(n) && /used|in_use/.test(n) && not(/gpu|swap|virtual|vram/)) return "ram_used";
  if (dc === "timestamp" && /boot|uptime|start/.test(n)) return "uptime";
  if (/power_?state|session_?state|system_?state|session/.test(n) && !u) return "state";
  if (/logged|signed|current_?user|active_?user|user/.test(n) && !u && not(/count|users/)) return "user";
  return null;
};

// The disks of the computer: a usage sensor in % per disk, and its free space when the device has one, matched by the
// disk's letter or name.
export const PC_DISK = /disk|drive|storage|volume|partition|filesystem|mount|space/;
export const pcDiskKey = (n) => (n.match(/(?:^|_)([a-z]):?(?:_|$)/)?.[1] || n.replace(/(disk|drive|storage|volume|partition|filesystem|mount|usage|used|use|free|space|available|percent|sensor|_+)/g, "_")).replace(/^_+|_+$/g, "");
export const pcDisks = (hass, ids) => {
  const label = (id) => pcNorm(`${id.split(".")[1]} ${hass.states[id]?.attributes.friendly_name || ""}`);
  const pct = ids.filter((id) => id.startsWith("sensor.") && hass.states[id]?.attributes.unit_of_measurement === "%" && PC_DISK.test(label(id)) && !/memory|ram|gpu/.test(label(id)));
  const free = ids.filter((id) => id.startsWith("sensor.") && PC_UNITS[String(hass.states[id]?.attributes.unit_of_measurement || "").toLowerCase()] && /free|avail/.test(label(id)));
  return pct.map((id) => {
    const key = pcDiskKey(pcNorm(id.split(".")[1]));
    return { id, key, free: free.find((f) => pcDiskKey(pcNorm(f.split(".")[1])) === key) };
  });
};

// The computers of the home: the devices of those integrations with a load or a power button, most complete first.
export const pcDevices = (hass) => {
  const reg = hass.entities || {};
  const score = {};
  for (const [id, e] of Object.entries(reg)) {
    if (!e.device_id || !PC_PLATFORMS.includes(e.platform)) continue;
    const r = pcRole(hass, id);
    if (r) score[e.device_id] = (score[e.device_id] || 0) + (r === "cpu" || r === "shutdown" ? 3 : 1);
  }
  return Object.keys(score)
    .filter((d) => score[d] >= 3)
    .sort((a, b) => score[b] - score[a]);
};

// The entity of each role on the computer's device (`entity`'s, else `device`, else the first computer of the home).
export const pcFind = (hass, entity, device, overrides = {}) => {
  const reg = hass.entities || {};
  const dev = device || (entity && reg[entity]?.device_id) || pcDevices(hass)[0];
  const ids = Object.keys(reg).filter((id) => dev && reg[id].device_id === dev && !reg[id].hidden);
  const out = { device: dev || null };
  for (const id of ids) {
    const r = pcRole(hass, id);
    if (r && !out[r]) out[r] = id;
  }
  out.disks = Array.isArray(overrides.disks) ? overrides.disks.map((d) => (typeof d === "string" ? { id: d, key: pcDiskKey(pcNorm(d.split(".")[1])) } : d)) : pcDisks(hass, ids);
  for (const [k, v] of Object.entries(overrides)) if (v && k !== "disks" && PC_ROLES.includes(k)) out[k] = v;
  return out;
};

// `n` points over [start, end] from a history ([{ t, v }], oldest first): the average in each slot, the last value
// carried over an empty slot, null before the first value.
export const pcSeries = (rows, start, end, n) => {
  const out = [];
  const step = (end - start) / n;
  let last = null;
  let i = 0;
  for (let k = 0; k < n; k++) {
    const to = start + (k + 1) * step;
    let sum = 0;
    let cnt = 0;
    while (i < rows.length && rows[i].t < to) {
      if (rows[i].v != null) {
        if (rows[i].t >= start + k * step) {
          sum += rows[i].v;
          cnt++;
        }
        last = rows[i].v;
      }
      i++;
    }
    out.push(cnt ? sum / cnt : last);
  }
  return out;
};

// The Intl formats, made once per language and options (a render formats many numbers).
export const pcIntlCache = new Map();
export const pcIntl = (Kind, lang, opts) => {
  const key = `${Kind.name}|${lang}|${JSON.stringify(opts)}`;
  if (!pcIntlCache.has(key)) pcIntlCache.set(key, new Kind(lang, opts));
  return pcIntlCache.get(key);
};
