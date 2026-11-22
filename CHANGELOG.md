# Changelog

## 1.0.2 - 2026-11-22

### Performance
- Card picker: the previews are back (`preview: true`), and light. Each card's preview is drawn only once it scrolls into view of Home Assistant's card picker, which otherwise builds the preview of every card at once: until then it holds Home Assistant's state (no render, no history request, no animation). On a dashboard or in the card editor the card is drawn as before.

## 1.0.1 - 2026-11-22

### Performance
- Card picker: the cards no longer ask Home Assistant for a live preview (`preview: false` in `window.customCards`). The picker drew every card at once (history requests, animations), which made the list slow to open; it now shows each card's description instead.

## 1.0.0 - 2026-11-22

### Features
- First release: `pc-card` and `pc-mini-card`. The computer's state (on, locked, asleep, off), the signed-in user and the uptime; CPU, GPU and RAM as bars with their last 24 hours behind them, the clocks and temperatures; the disks with their free space; lock, sleep, restart and shut down (with a confirmation at the top of the card), wake by its button or by Wake on LAN; an illustrated desk whose screen and tower light follow the state. System Bridge, HASS.Agent, LNXlink and the Home Assistant app on a Mac, found on the computer's device.
