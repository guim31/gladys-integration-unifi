# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- "VPN diagnostic" action: where the console lists the clients of its
  WireGuard servers (field names, counts and HTTP codes only), to find the
  connected clients that the 1.8.0 does not see yet.

### Fixed

- The WireGuard VPN widget showed another server when the device chosen in
  its settings was not a VPN server (the gateway): it now says so.

### Added

- WireGuard VPN server of the gateway (UCG, UDM…): a device with its state and
  the number of connected clients, a "WireGuard VPN" widget listing the
  connected clients, and the "VPN client connected" / "VPN client
  disconnected" scene triggers. Turning the server off from Gladys stays off
  until "Allow the VPN server control" is ticked. Developed without a
  WireGuard gateway at hand: feedback welcome.

### Changed

- Quieter logs. A normal poll, a client coming or leaving and a published state no longer write anything at the default level (they are still there with `LOG_LEVEL=debug`). A console that cannot be reached is reported once, then once again when it answers; the same for the real-time connection, which no longer logs every reconnection attempt. An action from Gladys (Internet access, Wi-Fi network, PoE port) still writes one line.
- Updated to version 0.15 of the Gladys integration SDK, and the dependencies to their latest compatible versions.

### Fixed

- An error during the startup or the discovery could write the whole HTTP request in the logs, including the API key or the session cookie of the console. Only the error message is written now.

## [1.7.0] - 2026-10-11

### Added

- German and Spanish translations, the two other languages of the Gladys interface: the configuration form, the "Test UniFi Connection" action and its result, the connection status, the store description, and the three dashboard widgets (labels, settings and content). A test now fails if a text misses one of the four languages or exceeds its length. Device and feature names are unchanged.

## [1.6.3] - 2026-10-10

### Fixed

- States are published only for the devices added to Gladys, and only when they change. Every poll published the presence and the Internet access of every known client, added or not: about 90 states every 30 seconds for 30 clients, close to the core's ceiling of 300 states a minute per integration (beyond which a whole batch is refused), and as many "not found (or not added to Gladys)" lines in the core's logs. "Present" is still sent again once a minute, so the "Check presence" scene action keeps seeing the device. A device added or updated in Gladys gets its states at once.

## [1.6.2] - 2026-10-10

### Fixed

- "Update" of a UniFi hardware device in the Discovery tab failed with HTTP 409 (`external_id must be unique`) for the users who had added the "Switch PoE" device of v1.5.2: since v1.6.0, the PoE ports were published on the hardware device with the same feature `external_id`s, still owned by that device. While the v1.5.2 "Switch PoE" device exists in Gladys, it keeps its PoE ports (same structure as v1.5.2, history and dashboards preserved) and the hardware device is published without them. Deleting it puts the ports back on the hardware device.
