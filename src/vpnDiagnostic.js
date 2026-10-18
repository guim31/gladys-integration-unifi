// -----------------------------------------------------------------------------
// "VPN diagnostic" (configuration action): where does this console list the
// clients of its WireGuard servers? The 1.8.0 looked for them among the
// active clients (`stat/sta`); on a UDR7 whose WireGuard clients are two
// remote gateways, they were not there (forum t/10426/60). The report gives
// what can be pasted on a public forum: field NAMES, counts and HTTP codes,
// never a value (no address, no key, no name besides the VPN's own).
// -----------------------------------------------------------------------------

import { inSubnet, isWireGuardServer } from './vpn.js';

/** Paths that may list the WireGuard peers or connections (none documented). */
export function candidatePaths(network, siteUuid) {
  const id = network._id;
  return [
    `/api/s/{site}/stat/remoteuservpn`,
    `/v2/api/site/{site}/wireguard/${id}/users`,
    `/v2/api/site/{site}/wireguard/${id}/clients`,
    `/v2/api/site/{site}/vpn/connections`,
    `/v2/api/site/{site}/clients/active`,
    ...(siteUuid ? [`/integration/v1/sites/${siteUuid}/clients?limit=200`] : []),
  ];
}

/** The shape of an answer: "200, 3 item(s): a, b, c" (keys of the first item only). */
export function shapeOf(body) {
  const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : null;
  if (list) {
    const keys = list[0] && typeof list[0] === 'object' ? Object.keys(list[0]).sort() : [];
    return `${list.length} item(s)${keys.length ? `: ${keys.join(', ')}` : ''}`;
  }
  if (body && typeof body === 'object') {
    return `object: ${Object.keys(body).sort().join(', ')}`;
  }
  return typeof body;
}

const statusOf = (err) => (err?.response?.status ? `HTTP ${err.response.status}` : 'no answer');

/** Distinct key names, across a list of objects, matching a pattern. */
function keysMatching(list, pattern) {
  const keys = new Set();
  for (const item of list) {
    for (const key of Object.keys(item ?? {})) {
      if (pattern.test(key)) {
        keys.add(key);
      }
    }
  }
  return [...keys].sort();
}

/**
 * The report, in English (a technical text meant to be pasted as is).
 * @param {object} unifiClient
 */
export async function vpnDiagnostic(unifiClient) {
  const lines = [];
  const networks = (await unifiClient.getNetworks()).filter(isWireGuardServer);
  const clients = await unifiClient.getClients();
  lines.push(`WireGuard servers: ${networks.length}; active clients (stat/sta): ${clients.length}`);
  const vpnKeys = keysMatching(clients, /vpn|wireguard|wg|tunnel|remote/i);
  lines.push(`stat/sta keys about VPN: ${vpnKeys.join(', ') || '-'}`);
  let siteUuid = null;
  try {
    const sites = await unifiClient.request('GET', '/integration/v1/sites');
    siteUuid = sites?.data?.[0]?.id ?? null;
  } catch {
    // The official API needs an API key: skipped with credentials.
  }
  for (const [index, network] of networks.entries()) {
    lines.push(
      `#${index + 1} ${network.enabled === false ? 'disabled' : 'enabled'}, subnet ${network.ip_subnet ? 'set' : 'missing'}; ` +
        `in subnet: ${clients.filter((c) => network.ip_subnet && inSubnet(c.ip, network.ip_subnet)).length}, ` +
        `same network_id: ${clients.filter((c) => c.network_id === network._id).length}`,
    );
    lines.push(`  networkconf keys: ${Object.keys(network).sort().join(', ')}`);
    for (const path of candidatePaths(network, siteUuid)) {
      const shown = path.replace(network._id, '<id>').replace(siteUuid ?? '\u0000', '<site>');
      try {
        lines.push(`  ${shown}: ${shapeOf(await unifiClient.request('GET', path))}`);
      } catch (err) {
        lines.push(`  ${shown}: ${statusOf(err)}`);
      }
    }
  }
  return lines.join('\n');
}
