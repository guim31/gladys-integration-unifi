# Ubiquiti UniFi Integration for Gladys Assistant

Connect your **Ubiquiti UniFi OS** console (UCG Fiber, Dream Machine UDM/UDM-SE, UniFi Express, Cloud Key, or self-hosted UniFi Controller) to Gladys Assistant.

## Features

- **Network Presence Tracking (Device Tracker)**: Real-time tracking of smartphones and connected network devices for Gladys presence/absence scenes.
- **Internet Access Control**: Switch button to block or unblock internet access for any connected client device.
- **Switch PoE Port Control**: Turn PoE power ON/OFF on switch ports (useful for power cycling IP cameras or Access Points).
- **Wi-Fi SSID Control**: Enable or disable Wi-Fi networks (e.g., Guest Wi-Fi) from Gladys dashboards or scenes.
- **WAN & Gateway Health Metrics**: Real-time Upload/Download throughput (Mbps) and Gateway online status.

---

## Configuration & Authentication

### Option 1: Local API Key (Recommended - UniFi OS 3.2+)

1. Log in to your UniFi OS console (e.g. `https://192.168.1.1`).
2. Go to **Control Plane > System > API Keys**.
3. Generate a **Local API Key** and copy it.
4. In Gladys, enter your console IP address, select **Local API Key** mode and paste your key.

### Option 2: Local Credentials (Username & Password)

1. Create a local user account in UniFi OS settings.
2. In Gladys, select **Local Username & Password** mode and enter your credentials.

---

## Usage

1. Save configuration and click **Test UniFi Connection** to verify settings.
2. Go to the **Discovery** tab in Gladys to import your Gateway, network clients, PoE ports, and Wi-Fi networks.
