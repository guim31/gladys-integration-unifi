// -----------------------------------------------------------------------------
// The device store of the Gladys core, reduced to what the Discovery screen
// relies on: the "created" / "structure_changed" flags of a published device,
// and POST /api/v1/device ("Add" / "Update"), which refuses a feature
// external_id already owned by another device, as the core does (HTTP 409).
// -----------------------------------------------------------------------------

// Same signature as getDiscoveredDevices.js of the core (v5.1.4).
const featureSignature = (f) =>
  JSON.stringify([
    f.external_id,
    f.category,
    f.type,
    f.unit || null,
    f.min ?? null,
    f.max ?? null,
    f.step ?? null,
  ]);

export class ConflictError extends Error {
  constructor(externalId) {
    super(`CONFLICT — external_id must be unique — external_id: ${externalId}`);
    this.status = 409;
    this.externalId = externalId;
  }
}

export function createFakeCore() {
  /** @type {Map<string, object>} created devices, by external_id */
  const created = new Map();

  return {
    created,

    /** POST /api/v1/device: create, or update the device of this external_id. */
    saveDevice(device) {
      for (const feature of device.features) {
        for (const other of created.values()) {
          if (other.external_id === device.external_id) {
            continue;
          }
          if (other.features.some((f) => f.external_id === feature.external_id)) {
            throw new ConflictError(feature.external_id);
          }
        }
      }
      created.set(device.external_id, structuredClone(device));
    },

    deleteDevice(externalId) {
      created.delete(externalId);
    },

    /** What `GET /api/integration/v1/device` answers. */
    devices() {
      return [...created.values()].map((d) => structuredClone(d));
    },

    /** The Discovery screen: the published devices with their flags. */
    discovery(published) {
      return published.map((device) => {
        const existing = created.get(device.external_id) || null;
        const signatures = (features) => JSON.stringify(features.map(featureSignature).sort());
        return {
          ...device,
          created: existing !== null,
          structure_changed:
            existing !== null && signatures(device.features) !== signatures(existing.features),
        };
      });
    },
  };
}
