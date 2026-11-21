# ha-pc-card

[![Marketplace](https://img.shields.io/badge/Marketplace-Custom-41BDF5.svg)](https://www.home-assistant.io/integrations/marketplace/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/juju35/ha-pc-card/blob/main/LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/julienstep9)

<p align="center"><img src="https://raw.githubusercontent.com/juju35/ha-pc-card/main/images/icon.svg" alt="PC Card" width="120"></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/juju35/ha-pc-card/main/images/system-bridge.png" alt="System Bridge" height="36">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-pc-card/main/images/hass-agent.png" alt="HASS.Agent" height="36">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-pc-card/main/images/lnxlink.png" alt="LNXlink" height="36">
</p>

A Lovelace card for **PCs and Macs**: their state, CPU, GPU, RAM and disks, the signed-in user, and buttons to wake, lock, sleep or shut them down (with a confirmation).

> [!NOTE]
> This card is being designed: there is no release yet. Watch the repository to know when the first version is out.

| Card | Type | What it shows |
|---|---|---|
| PC | `custom:pc-card` | A computer's state, CPU, GPU, RAM and disks, the signed-in user, and its wake, lock, sleep and shutdown buttons. |
| PC mini | `custom:pc-mini-card` | The computer's state and load on two lines, with a zoom to the full card. |

## Supported integrations

The card reads the sensors and controls of these integrations:

| | Integration | What the cards show |
|:---:|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-pc-card/main/images/system-bridge.png" alt="System Bridge" height="24"> | [System Bridge](https://www.home-assistant.io/integrations/system_bridge/) (built in) | Windows and Linux: CPU, GPU, memory, disks, power actions |
| <img src="https://raw.githubusercontent.com/juju35/ha-pc-card/main/images/hass-agent.png" alt="HASS.Agent" height="24"> | [HASS.Agent](https://github.com/hass-agent/HASS.Agent-Integration) (Marketplace) | Windows: sensors, commands and notifications |
| <img src="https://raw.githubusercontent.com/juju35/ha-pc-card/main/images/lnxlink.png" alt="LNXlink" height="24"> | [LNXlink](https://github.com/bkbilly/lnxlink) (MQTT) | Linux: sensors and controls through MQTT discovery |
|  | [Mobile App (macOS)](https://www.home-assistant.io/integrations/mobile_app/) (built in) | The Home Assistant macOS app's sensors |
|  | [Wake on LAN](https://www.home-assistant.io/integrations/wake_on_lan/) (built in) | Turn the computer on |

## Installation

### Via the Marketplace (recommended)

Click the button below to add the repository directly:

[![Add to the Marketplace](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=juju35&repository=ha-pc-card&category=plugin)

Or manually:

1. Open **Settings → Marketplace → Add from link** (top right; this needs a GitHub account connected)
2. Add `https://github.com/juju35/ha-pc-card` — Type: **Dashboard**
3. Open **PC Card** and click **Install**
4. Clear your browser cache and refresh

The Marketplace registers the dashboard resource for you.

### Manual

1. Download `ha-pc-card.js` and the `ha-pc-card.i18n.*.js` translation files from the [latest release](https://github.com/juju35/ha-pc-card/releases/latest)
2. Copy them all to `/config/www/` (without the translation files, the cards show in English)
3. Go to **Settings → Dashboards → Resources** → Add resource:
   - URL: `/local/ha-pc-card.js`
   - Type: **JavaScript Module**
4. Clear your browser cache and refresh

## License

[MIT](https://github.com/juju35/ha-pc-card/blob/main/LICENSE)

## Support

If you find this project useful, you can support its development:

<a href="https://buymeacoffee.com/julienstep9"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="50"></a>
