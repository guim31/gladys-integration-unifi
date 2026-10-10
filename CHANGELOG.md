# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- "Update" of a UniFi hardware device in the Discovery tab failed with HTTP 409 (`external_id must be unique`) for the users who had added the "Switch PoE" device of v1.5.2: since v1.6.0, the PoE ports were published on the hardware device with the same feature `external_id`s, still owned by that device. While the v1.5.2 "Switch PoE" device exists in Gladys, it keeps its PoE ports (same structure as v1.5.2, history and dashboards preserved) and the hardware device is published without them. Deleting it puts the ports back on the hardware device.
