// -----------------------------------------------------------------------------
// The WireGuard VPN server of the gateway (UCG, UDM...): forum t/10426/57.
//
// The server is a network of `rest/networkconf`: `purpose: remote-user-vpn`,
// `vpn_type: wireguard-server`, `enabled`, `ip_subnet` (e.g. 192.168.3.1/24).
// Its connected clients are the active remote-user VPN connections
// (`stat/remoteuservpn`) whose `network_id` is the server, named after the
// peers of the server (`v2 …/wireguard/<id>/users`): seen on a UDR7 whose
// clients are two remote UniFi gateways (forum t/10426/62). An active
// client of `stat/sta` inside the VPN subnet counts too (a console that
// lists them there).
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

/**
 * The connected clients of a WireGuard server: its active connections, then
 * the active clients inside its subnet not already counted.
 * @param {object} network a WireGuard server of `rest/networkconf`
 * @param {Array<object>} clients the active clients (`stat/sta`)
 * @param {Array<object>} [connections] `stat/remoteuservpn`
 * @param {Array<object>} [users] the peers of this server
 */
export function vpnClientsOf(network, clients, connections = [], users = []) {
  const peers = new Map((users ?? []).map((user) => [String(user._id), user]));
  const connected = (connections ?? [])
    .filter((c) => c && c.network_id === network._id && c.up !== false)
    .map((c) => {
      const peer = peers.get(String(c.user ?? '')) ?? peers.get(String(c.peer_id ?? ''));
      return {
        key: String(c.peer_id ?? c.user ?? c.id ?? c.tunnel_ip ?? ''),
        name: peer?.name || c.name || c.tunnel_ip || 'VPN',
        ip: c.tunnel_ip,
        rx_bytes: c.rx_bytes,
        tx_bytes: c.tx_bytes,
      };
    });
  const seen = new Set(connected.map((c) => c.ip).filter(Boolean));
  const listed = (clients ?? []).filter(
    (client) =>
      client &&
      !seen.has(client.ip) &&
      ((network.ip_subnet && inSubnet(client.ip, network.ip_subnet)) ||
        (client.network_id && client.network_id === network._id)),
  );
  return [...connected, ...listed];
}

/** The key of a VPN client between two polls: its MAC, else its IP. */
export const vpnClientKey = (client) =>
  String(client.key || client.mac || client.ip || client.name || '').toLowerCase();

/** The name of a VPN client as the console shows it. */
export const vpnClientName = (client) =>
  String(client.name || client.hostname || client.ip || 'VPN').trim();
