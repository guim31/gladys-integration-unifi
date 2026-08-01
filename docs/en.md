# Ubiquiti UniFi Integration for Gladys Assistant

Connect your **Ubiquiti UniFi OS** console (UCG Fiber, Dream Machine UDM/UDM-SE, UniFi Express, Cloud Key, or self-hosted UniFi Controller) to Gladys Assistant.

## Features

- **Network Presence Tracking (Device Tracker)**: Real-time tracking of smartphones and connected network devices for Gladys presence/absence scenes.
- **Internet Access Control**: Switch button to block or unblock internet access for any connected client device.
- **Switch PoE Port Control**: Turn PoE power ON/OFF on switch ports (useful for power cycling IP cameras or Access Points).
- **Wi-Fi SSID Control**: Enable or disable Wi-Fi networks (e.g., Guest Wi-Fi) from Gladys dashboards or scenes.
- **WAN & Gateway Health Metrics**: Real-time Upload/Download throughput (Mbps) and Gateway online status.

---

## Local Authentication Guide (100% Local First)

The integration connects directly to your local UniFi console using a **local admin account**:

### Create a dedicated local admin account in UniFi OS:

1. Log into your UniFi OS console (`https://192.168.1.1` or `https://192.168.100.1`).
2. In the left navigation bar, click **Admins / Users (👥)** (or under _Control Plane / Identity > Admins_).
3. Click **Add Admin**.
4. Select **Local Access Only**.
5. Set a username (e.g. `gladys`) and password.
6. Grant **Admin** role (required to block internet or toggle PoE ports) or **Read Only**.
7. In Gladys, enter your console IP address, username `gladys`, and local password.

---

## Usage

1. Save configuration in Gladys and click **Test UniFi Connection** to verify.
2. Go to the **Discovery** tab in Gladys to import your Gateway, network clients, PoE ports, and Wi-Fi networks.
