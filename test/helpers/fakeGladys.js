// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
// -----------------------------------------------------------------------------

export function createFakeGladys() {
  const published = [];
  const cameraImages = [];
  const transports = [];
  const connectionStatuses = [];
  const externalId = (suffix) => `unifi:${suffix}`;

  return {
    published,
    cameraImages,
    transports,
    connectionStatuses,

    externalId,

    // Same shape as the SDK: `externalIds(t, id).feature(k)` === `externalId(\`${t}:${id}:${k}\`)`.
    externalIds(type, platformId) {
      const device = externalId(`${type}:${platformId}`);
      return {
        device,
        feature: (key) => `${device}:${key}`,
      };
    },

    async publishState(featureExternalId, state) {
      published.push({ featureExternalId, state });
    },

    async publishStates(states) {
      for (const s of states) {
        published.push({ featureExternalId: s.device_feature_external_id, state: s.state });
      }
    },

    async publishCameraImage(deviceExternalId, image) {
      cameraImages.push({ deviceExternalId, image });
    },

    async publishTransports(entries) {
      transports.push(...entries);
    },

    async setConnectionStatus(connected, message) {
      connectionStatuses.push({ connected, message });
    },
  };
}
