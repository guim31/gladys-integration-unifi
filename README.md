# Gladys Assistant UniFi Integration

[![Gladys Assistant](https://img.shields.io/badge/Gladys-Assistant_4.84+-blue.svg)](https://gladysassistant.com)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io-blue.svg)](https://ghcr.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-green.svg)](LICENSE)

Official external integration for **Ubiquiti UniFi Network** on [Gladys Assistant](https://gladysassistant.com).

## Supported Hardware & Consoles

- **UniFi Gateways**: UCG Fiber, UDM, UDM Pro, UDM SE, UniFi Express (UX), USG.
- **UniFi Switches**: All UniFi PoE Switches (PoE Port Control).
- **UniFi Access Points**: All UniFi APs.
- **UniFi Controllers**: UniFi OS (v3.x / v4.x / v5.x) & Self-hosted UniFi Network Controllers.

---

## Features

1. **Device Tracker & Presence Detection**: Monitor smartphones and devices connected to Wi-Fi/Ethernet with customizable offline hysteresis delay.
2. **Internet Blocking Switch**: Block or unblock internet access per device directly from Gladys.
3. **PoE Port Power Control**: Toggle PoE power on switch ports to reboot cameras or APs.
4. **Wi-Fi SSID Switch**: Turn Wi-Fi networks (such as Guest Wi-Fi) ON/OFF via Gladys scenes.
5. **WAN Metrics**: Download/Upload speeds in Mbps and Gateway status.

---

## Getting Started & Authentication

### 1. Installation in Gladys Assistant

From the Gladys Assistant interface:

1. Go to **Integrations > External Integrations**.
2. Search for **UniFi Network** and click **Install**.

### 2. Authentication Options

- **Option A: Local API Key** (Recommended):
  - Local: Console Settings ⚙️ > System > Integrations / API.
  - Cloud: [unifi.ui.com](https://unifi.ui.com) > Settings > API Keys.
- **Option B: Local Username & Password**:
  - Console sidebar > Admins 👥 > Add Admin > Local Access Only (Read Only or Admin).

---

## Development

```bash
# Clone the repository
git clone https://github.com/guim31/gladys-integration-unifi.git
cd gladys-integration-unifi

# Install dependencies
npm install

# Run linter & tests
npm run lint
npm test

# Build Docker image locally
docker build -t gladys-integration-unifi .
```

## License

[Apache 2.0](LICENSE)
