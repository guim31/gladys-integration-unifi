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

## Dashboard widgets

Since Gladys 5.1, the integration offers three widgets in the dashboard editor. They read the integration's last poll (every 30 seconds) and never query the console on their own. No widget shows a MAC or an IP address: a dashboard can be public.

- **Network**: the network at a glance. Two tiles, "Download" and "Upload", and a chart follow the gateway's WAN throughput features, live; the "Clients" (active clients) and "Devices" (UniFi hardware online / total) tiles come from the last poll; the status list gives the Internet state (the console's WAN subsystem), the Wi-Fi, wired and guest clients, and the hardware offline.
  - Settings: **Gateway** (the gateway added to Gladys; empty = the first known gateway) and **Chart period** (last hour, last day, last week).
  - Limits: the throughput and the chart need the gateway to be **added to Gladys** from the Discovery tab (its features feed the tiles and the history). Without a UniFi gateway (a console that does not route), only the counters and the status list show.
- **Presence**: who is home, from the **network clients added to Gladys**, with their Gladys names. A "Present" tile (`n / N`) and one row per device (present first, then by name); beyond ten rows, a "+ n more" note. The widget refreshes itself as soon as a presence changes.
  - Setting: **Show** (present and absent, or present only).
  - Limits: a device not added to Gladys does not appear; rename the devices in Gladys for readable names.
- **Wi-Fi**: one Wi-Fi network (SSID): its state, its connected clients, whether it is a guest network, its band and security when the console gives them, and two buttons, **Enable** / **Disable**. The use case: the guest Wi-Fi, opened for the time of a visit from a wall tablet.
  - Setting: **Wi-Fi network** (the SSID added to Gladys; empty = the first known SSID).
  - Limits: the buttons go through the SSID's "Wi-Fi state" feature, so the SSID must be **added to Gladys** from the Discovery tab. The client count is the Wi-Fi clients whose SSID is this one at the last poll.
