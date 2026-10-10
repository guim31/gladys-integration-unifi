// -----------------------------------------------------------------------------
// The one way states leave the integration.
//
// Gladys caps an integration at 300 states a minute (a whole batch is refused
// beyond) and re-evaluates the scenes on each state. A UniFi site has dozens
// of clients the user never adds: their states only make the core log
// "DeviceFeature ... not found (or not added to Gladys)". So a state is
// published only for a feature of a device created in Gladys, and only when
// its value changed -- except a presence sensor that reads "present": the
// "Check presence" scene action reads `last_value_changed`, which the core
// refreshes on every state, so "present" is published again at most once a
// minute (the lan-manager service of the core republishes it on every scan).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, logger } from '@gladysassistant/integration-sdk';

export const PRESENCE_HEARTBEAT_MS = 60 * 1000;

/**
 * @param {object} gladys the SDK object; `gladys.devices` is the list of the
 *   devices created in Gladys, kept up to date by the SDK (GET /device at
 *   connection and at each getDevices(), then the created / updated / deleted
 *   events).
 * @param {object} [options]
 * @param {() => number} [options.now]
 */
export function createStatePublisher(gladys, { now = Date.now } = {}) {
  /** @type {Map<string, { value: unknown, at: number }>} last published state, by feature */
  const last = new Map();
  let source = null;
  /** @type {Map<string, object>} created features, by external_id */
  let features = new Map();

  function createdFeatures() {
    // The SDK replaces the array on every change: rebuild on a new one only.
    if (gladys.devices !== source) {
      source = gladys.devices;
      features = new Map();
      for (const device of Array.isArray(source) ? source : []) {
        for (const feature of device?.features || []) {
          if (feature?.external_id) {
            features.set(feature.external_id, feature);
          }
        }
      }
    }
    return features;
  }

  return {
    /** True when the feature belongs to a device created in Gladys. */
    isCreated(featureExternalId) {
      return createdFeatures().has(featureExternalId);
    },

    /**
     * Publish a state if its feature exists in Gladys and the value changed.
     * `force` publishes it anyway: the optimistic state of a command, whose
     * feature Gladys just sent. Never throws.
     * @returns {Promise<boolean>} true when the state was sent
     */
    async publish(featureExternalId, value, { force = false } = {}) {
      const feature = createdFeatures().get(featureExternalId);
      if (!feature && !force) {
        return false;
      }
      const previous = last.get(featureExternalId);
      const at = now();
      if (!force && previous && previous.value === value) {
        const heartbeat =
          feature?.category === DEVICE_FEATURE_CATEGORIES.PRESENCE_SENSOR &&
          value === 1 &&
          at - previous.at >= PRESENCE_HEARTBEAT_MS;
        if (!heartbeat) {
          return false;
        }
      }
      try {
        await gladys.publishState(featureExternalId, value);
      } catch (err) {
        logger.debug(`publishState ${featureExternalId} failed: ${err.message}`);
        return false;
      }
      last.set(featureExternalId, { value, at });
      return true;
    },

    /** Publish the next value of these features whatever it is. */
    forget(featureExternalIds) {
      for (const id of featureExternalIds) {
        last.delete(id);
      }
    },

    /** Publish every next value (reconnection, new configuration). */
    reset() {
      last.clear();
    },
  };
}
