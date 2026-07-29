// CIDR IP whitelist matching — IPv4 and IPv6.
// Zero dependencies: pure bitwise arithmetic using Node.js built-ins.
//
// Supports:
//   Single IPv4:   "1.2.3.4"
//   IPv4 CIDR:     "192.168.0.0/24"
//   Single IPv6:   "::1"
//   IPv6 CIDR:     "2001:db8::/32"
//
// Performance: cidrToRange() is O(1); ipToNumber() is O(n) on the IP string.
// For API-key validation (called once per request), this is negligible.

// ── IPv4 ──────────────────────────────────────────────────────────────────────

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const byte = parseInt(part, 10);
    if (!Number.isFinite(byte) || byte < 0 || byte > 255) return null;
    n = (n << 8) | byte;
  }
  return n >>> 0; // unsigned 32-bit
}

function ipv4CidrRange(cidr: string): { start: number; end: number } | null {
  const [net, bits] = cidr.split("/");
  const prefix = parseInt(bits, 10);
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return null;
  const base = ipv4ToNumber(net);
  if (base === null) return null;
  const mask = prefix === 0 ? 0 : ((~0) << (32 - prefix)) >>> 0;
  const start = (base & mask) >>> 0;
  const end = (start | (~mask >>> 0)) >>> 0;
  return { start, end };
}

function matchesIpv4Cidr(ip: string, cidr: string): boolean {
  const n = ipv4ToNumber(ip);
  if (n === null) return false;
  if (!cidr.includes("/")) {
    const target = ipv4ToNumber(cidr);
    return target !== null && n === target;
  }
  const range = ipv4CidrRange(cidr);
  if (!range) return false;
  return n >= range.start && n <= range.end;
}

// ── IPv6 ──────────────────────────────────────────────────────────────────────

function expandIpv6(ip: string): string | null {
  // Handle :: expansion
  const halves = ip.split("::");
  if (halves.length > 2) return null;

  function parseGroups(s: string): string[] | null {
    if (s === "") return [];
    const parts = s.split(":");
    for (const p of parts) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return null;
    }
    return parts;
  }

  if (halves.length === 2) {
    const left = parseGroups(halves[0]);
    const right = parseGroups(halves[1]);
    if (!left || !right) return null;
    const fill = 8 - left.length - right.length;
    if (fill < 0) return null;
    return [...left, ...Array(fill).fill("0000"), ...right]
      .map((g) => g.padStart(4, "0"))
      .join(":");
  }

  const parts = parseGroups(ip);
  if (!parts || parts.length !== 8) return null;
  return parts.map((g) => g.padStart(4, "0")).join(":");
}

function ipv6ToBuffer(ip: string): Buffer | null {
  const expanded = expandIpv6(ip);
  if (!expanded) return null;
  const groups = expanded.split(":");
  const buf = Buffer.alloc(16);
  for (let i = 0; i < 8; i++) {
    const v = parseInt(groups[i], 16);
    buf.writeUInt16BE(v, i * 2);
  }
  return buf;
}

function matchesIpv6Cidr(ip: string, cidr: string): boolean {
  const ipBuf = ipv6ToBuffer(ip);
  if (!ipBuf) return false;

  if (!cidr.includes("/")) {
    const targetBuf = ipv6ToBuffer(cidr);
    if (!targetBuf) return false;
    return ipBuf.equals(targetBuf);
  }

  const [net, bits] = cidr.split("/");
  const prefix = parseInt(bits, 10);
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 128) return false;
  const netBuf = ipv6ToBuffer(net);
  if (!netBuf) return false;

  // Compare byte by byte using the prefix mask
  for (let i = 0; i < 16; i++) {
    const bitsInThisByte = Math.max(0, Math.min(8, prefix - i * 8));
    if (bitsInThisByte === 0) break;
    const mask = bitsInThisByte === 8 ? 0xff : ((0xff << (8 - bitsInThisByte)) & 0xff);
    if ((ipBuf[i] & mask) !== (netBuf[i] & mask)) return false;
  }
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns true if `ip` falls within `cidrOrIp` (single IP or CIDR notation). */
export function ipMatchesCidr(ip: string, cidrOrIp: string): boolean {
  const trimmed = ip.trim();
  const target = cidrOrIp.trim();
  if (!trimmed || !target) return false;
  // Heuristic: IPv6 contains ":" (unless it's a mapped IPv4 — ignore for now)
  if (trimmed.includes(":") || target.includes(":")) {
    return matchesIpv6Cidr(trimmed, target);
  }
  return matchesIpv4Cidr(trimmed, target);
}

/** Returns true if `ip` matches any entry in `whitelist`. */
export function ipInWhitelist(ip: string, whitelist: string[]): boolean {
  return whitelist.some((entry) => ipMatchesCidr(ip, entry));
}
