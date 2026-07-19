import { isIP } from "node:net";
import type { NextRequest } from "next/server";

const ALLOWED_HEADERS = new Set([
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
]);

function cleanIp(value: string | null): string | null {
  const candidate = (value ?? "").trim().replace(/^\[|\]$/g, "");
  const withoutPort = candidate.includes(":") && candidate.includes(".")
    ? candidate.replace(/:\d+$/, "")
    : candidate;
  return isIP(withoutPort) ? withoutPort : null;
}

/**
 * Forwarded client addresses are accepted only when deployment configuration
 * explicitly names the trusted proxy header. Without that contract, attacker-
 * controlled forwarding headers are ignored and the address is unknown.
 */
export function getTrustedClientIp(request: NextRequest): string | null {
  const configured = process.env.TECPEY_TRUSTED_PROXY_HEADER?.trim().toLowerCase();
  if (!configured || !ALLOWED_HEADERS.has(configured)) return null;

  if (configured !== "x-forwarded-for") {
    return cleanIp(request.headers.get(configured));
  }

  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => cleanIp(entry))
    .filter((entry): entry is string => Boolean(entry));
  if (!chain.length) return null;

  const hops = Number.parseInt(process.env.TECPEY_TRUSTED_PROXY_HOPS ?? "1", 10);
  if (!Number.isInteger(hops) || hops < 1 || hops > 10) return null;
  const index = chain.length - hops - 1;
  return index >= 0 ? chain[index] : chain[0] ?? null;
}
