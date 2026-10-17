// -----------------------------------------------------------------------------
// The WireGuard VPN server of the gateway (UCG, UDM...): forum t/10426/57.
//
// The server is a network of `rest/networkconf`: `purpose: remote-user-vpn`,
// `vpn_type: wireguard-server`, `enabled`, `ip_subnet` (e.g. 192.168.3.1/24).
// Its connected clients show among the clients of the console (`stat/sta`,
// as in the Client Devices page): they are recognized by their IP inside the
// VPN subnet, or by the `network_id` of the server. Not tested on a real
// gateway with a WireGuard server yet: feedback welcome.
// -----------------------------------------------------------------------------

/** A WireGuard server of the gateway. */
export function isWireGuardServer(network) {
  return (
    Boolean(network?._id) &&
    network.purpose === 'remote-user-vpn' &&
    /wireguard/i.test(String(network.vpn_type ?? ''))
  );
}

/** "192.168.3.1/24" → [base as a 32-bit number, mask], null when unusable. */
function parseSubnet(cidr) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(String(cidr ?? '').trim());
  if (!match) {
    return null;
  }
  const bits = Number(match[2]);
  const address = ipToNumber(match[1]);
  if (address === null || bits > 32) {
    return null;
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return [(address & mask) >>> 0, mask];
}

function ipToNumber(ip) {
  const parts = String(ip ?? '')
    .split('.')
    .map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

/** Whether an IPv4 is inside a subnet "a.b.c.d/n". */
export function inSubnet(ip, cidr) {
  const subnet = parseSubnet(cidr);
  const address = ipToNumber(ip);
  return subnet !== null && address !== null && (address & subnet[1]) >>> 0 === subnet[0];
}

/** The connected clients of a WireGuard server, among the active clients. */
export function vpnClientsOf(network, clients) {
  return (clients ?? []).filter(
    (client) =>
      client &&
      ((network.ip_subnet && inSubnet(client.ip, network.ip_subnet)) ||
        (client.network_id && client.network_id === network._id)),
  );
}

/** The key of a VPN client between two polls: its MAC, else its IP. */
export const vpnClientKey = (client) =>
  String(client.mac || client.ip || client.name || '').toLowerCase();

/** The name of a VPN client as the console shows it. */
export const vpnClientName = (client) =>
  String(client.name || client.hostname || client.ip || 'VPN').trim();
