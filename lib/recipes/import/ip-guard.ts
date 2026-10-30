// Server-only module: SSRF address checks for the recipe URL fetcher.
import net from "node:net";

function parseIPv4(addr: string): number[] | null {
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function ipv4Blocked(o: number[]): boolean {
  const [a, b, c] = o;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10/8
    (a === 100 && b >= 64 && b <= 127) || // 100.64/10
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local + metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12
    (a === 192 && b === 0 && c === 0) || // 192.0.0/24
    (a === 192 && b === 0 && c === 2) || // 192.0.2/24
    (a === 192 && b === 168) || // 192.168/16
    (a === 198 && (b === 18 || b === 19)) || // 198.18/15
    (a === 198 && b === 51 && c === 100) || // 198.51.100/24
    (a === 203 && b === 0 && c === 113) || // 203.0.113/24
    a >= 224 // multicast 224/4 + reserved 240/4
  );
}

/** Parses an IPv6 literal (optionally with an embedded dotted IPv4 tail and a zone id) into 8 groups. */
function parseIPv6(input: string): number[] | null {
  let addr = input;
  const zone = addr.indexOf("%");
  if (zone >= 0) addr = addr.slice(0, zone);
  if (addr.startsWith("[") && addr.endsWith("]")) addr = addr.slice(1, -1);

  const lastColon = addr.lastIndexOf(":");
  if (lastColon < 0) return null;
  let tail: number[] = [];
  const maybeV4 = addr.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const v4 = parseIPv4(maybeV4);
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    addr = addr.slice(0, lastColon + 1) + "0:0";
  }

  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const parseGroups = (s: string): number[] | null => {
    if (s === "") return [];
    const out: number[] = [];
    for (const g of s.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = parseGroups(halves[0]);
  if (!head) return null;
  let groups: number[];
  if (halves.length === 2) {
    const rest = parseGroups(halves[1]);
    if (!rest) return null;
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...new Array<number>(missing).fill(0), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  if (tail.length) {
    groups[6] = tail[0];
    groups[7] = tail[1];
  }
  return groups;
}

function ipv6Blocked(g: number[]): boolean {
  // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d (first 96 bits zero)
  if (g.slice(0, 6).every((x) => x === 0)) return true;
  // ::ffff:0:0/96 IPv4-mapped
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return ipv4Blocked([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  }
  // 64:ff9b::/96 NAT64
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return ipv4Blocked([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  }
  // 64:ff9b:1::/48 local-use NAT64
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true;
  // 2002::/16 6to4 embeds an IPv4 address in groups 1-2
  if (g[0] === 0x2002) {
    return ipv4Blocked([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255]);
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // 2001:db8::/32 documentation
  return false;
}

/** True when the address is private/reserved or cannot be parsed (fail closed). */
export function isBlockedAddress(address: string): boolean {
  const bare = address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;
  const family = net.isIP(bare.split("%")[0]);
  if (family === 4) {
    const o = parseIPv4(bare);
    return !o || ipv4Blocked(o);
  }
  if (family === 6) {
    const g = parseIPv6(bare);
    return !g || ipv6Blocked(g);
  }
  return true;
}

/** True when the URL hostname is an IP literal (Node never does a DNS lookup for those). */
export function isIpLiteral(hostname: string): boolean {
  const bare = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  return net.isIP(bare.split("%")[0]) !== 0;
}
