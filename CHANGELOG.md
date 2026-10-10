# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- States are published only for the devices added to Gladys, and only when they change. Every poll published the presence and the Internet access of every known client, added or not: about 90 states every 30 seconds for 30 clients, close to the core's ceiling of 300 states a minute per integration (beyond which a whole batch is refused), and as many "not found (or not added to Gladys)" lines in the core's logs. "Present" is still sent again once a minute, so the "Check presence" scene action keeps seeing the device. A device added or updated in Gladys gets its states at once.

- "Update" of a UniFi hardware device in the Discovery tab failed with HTTP 409 (`external_id must be unique`) for the users who had added the "Switch PoE" device of v1.5.2: since v1.6.0, the PoE ports were published on the hardware device with the same feature `external_id`s, still owned by that device. While the v1.5.2 "Switch PoE" device exists in Gladys, it keeps its PoE ports (same structure as v1.5.2, history and dashboards preserved) and the hardware device is published without them. Deleting it puts the ports back on the hardware device.
