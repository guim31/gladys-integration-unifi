# Ubiquiti UniFi Integration for Gladys Assistant

Connect your **Ubiquiti UniFi OS** console (UCG Fiber, Dream Machine UDM/UDM-SE, UniFi Express, Cloud Key, or self-hosted UniFi Controller) to Gladys Assistant.

## Features

- **Network Presence Tracking (Device Tracker)**: Real-time tracking of smartphones and connected network devices for Gladys presence/absence scenes.
- **Internet Access Control**: Switch button to block or unblock internet access for any connected client device.
- **Switch PoE Port Control**: Turn PoE power ON/OFF on switch ports (useful for power cycling IP cameras or Access Points).
- **Wi-Fi SSID Control**: Enable or disable Wi-Fi networks (e.g., Guest Wi-Fi) from Gladys dashboards or scenes.
- **WAN & Gateway Health Metrics**: Real-time Upload/Download throughput (Mbps) and Gateway online status.

---

## Authentication Guide: Where to find credentials?

The integration supports 2 authentication methods:

### Method A: Local API Key (Recommended)

Depending on your UniFi OS version:

1. **Option 1 (On local console)**:
   - Log into your UniFi console (e.g. `https://192.168.1.1`).
   - Click **Settings (Gear icon ⚙️)** at bottom left.
   - Navigate to **System** > **Integrations (API)** or **Advanced**.
   - Click **Create New API Key** and copy the generated key.

2. **Option 2 (Via UniFi Site Manager)**:
   - Visit [unifi.ui.com](https://unifi.ui.com).
   - Go to **Settings** (⚙️) > **API Keys**.
   - Click **Create New API Key** and copy the key.

---

### Method B: Local Admin Account (Username & Password)

If API Keys are not enabled on your UniFi OS version:

1. Log into your UniFi OS console (`https://192.168.1.1`).
2. In the left navigation bar, click **Admins / Users (👥)** (or under _Control Plane / Identity > Admins_).
3. Click **Add Admin**.
4. Select **Local Access Only**.
5. Set a username (e.g. `gladys`) and password.
6. Grant **Read Only** or **Admin** role (Admin write access is required if you want to block internet or toggle PoE ports).
7. In Gladys, select **Local Username & Password** mode and enter credentials.

---

## Usage

1. Save configuration in Gladys and click **Test UniFi Connection** to verify.
2. Go to the **Discovery** tab in Gladys to import your Gateway, network clients, PoE ports, and Wi-Fi networks.
