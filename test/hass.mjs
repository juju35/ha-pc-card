// The mock computer of the screenshots (scripts/screenshots/mock.mjs), with callService and callWS recorded.
import { NOW, setup } from "../scripts/screenshots/mock.mjs";

export { NOW };
export const st = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes, last_changed: "2026-06-21T10:00:00Z" });

export const makeHass = (scene = "on", overrides = {}) => {
  const { hass, config } = setup({ scene });
  const h = {
    ...hass,
    themes: { darkMode: false },
    calls: [],
    ws: [],
    callService(domain, service, data) {
      this.calls.push([domain, service, data]);
    },
    async callWS(msg) {
      h.ws.push(msg);
      return msg.type === "history/history_during_period" ? hass.__ws.history : null;
    },
    ...overrides,
  };
  return { hass: h, config };
};
