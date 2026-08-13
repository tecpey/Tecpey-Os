import type { NextRequest } from "next/server";
import { logger } from "./logger";
import { lookupTenantHost } from "./security/request-tenant-assertion";
import { normalizeHostHeader } from "./security/tenant-host-resolution";

/**
 * Verifies that a state-changing request originates from the same site.
 *
 * Browsers always include the Origin header on cross-origin requests (CORS)
 * and on same-origin POST requests. Checking it blocks CSRF attacks without
 * requiring a token round-trip.
 *
 * Returns true when the request is safe to process.
 */
export async function verifyCsrfOrigin(req: NextRequest): Promise<boolean> {
  const origin = req.headers.get("origin");

  // No Origin header — same-origin navigation or server-to-server call.
  if (!origin) return true;

  // Allow localhost origins in non-production environments.
  if (process.env.NODE_ENV !== "production") {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return true;
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (!siteUrl) {
    // Fail closed whatever the environment. The previous behaviour returned
    // true outside production so local development would not be blocked, but
    // the localhost allowance above already covers that case: any request that
    // reaches here carries a non-localhost Origin, and accepting an arbitrary
    // external Origin is never what a developer needs. A staging or preview
    // deployment running with NODE_ENV unset would otherwise have accepted
    // cross-origin state-changing requests from anywhere.
    logger.error(
      "[csrf] NEXT_PUBLIC_SITE_URL is not set — blocking cross-origin request as a safety measure. Set NEXT_PUBLIC_SITE_URL to the deployment URL.",
    );
    return false;
  }

  try {
    if (origin === new URL(siteUrl).origin) return true;
  } catch {
    return false;
  }

  // Everything above is the original control and still decides every request on
  // the platform's own domain, so the tenant-domain path below costs nothing on
  // the normal path — it is only reached by an Origin that is not the site URL.
  return verifiedTenantSameOrigin(req, origin);
}

/**
 * A white-label tenant serves the product on its own domain, so a browser there
 * sends that domain in Origin and the single-origin comparison above refuses it
 * — every mutation on a bound custom domain returned 403 while reads resolved
 * normally.
 *
 * The allowance is deliberately narrower than "an Origin that is a bound tenant
 * domain". With two tenants bound, that rule would let a page on one mint
 * state-changing requests against the other: cross-tenant CSRF, a threat that
 * does not exist while the allow-list is a single origin. So the Origin must
 * name the host the request was actually *addressed to*. Same-site stays
 * same-site, and a second bound tenant remains a stranger.
 *
 * `platform_tenant_domains` is the only source of truth here. An arbitrary Host
 * proves nothing: it is attacker-controlled, so it is checked against the
 * directory rather than trusted, and an unreachable directory refuses.
 */
async function verifiedTenantSameOrigin(
  req: NextRequest,
  origin: string,
): Promise<boolean> {
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  // The header must be a bare serialized origin and nothing else. Parsing is
  // lossy in exactly the direction that hurts: `new URL("https://user@acme.com")`
  // quietly discards the userinfo and reports `acme.com` as the host, so a
  // smuggled value would pass a host comparison and the `@` would never reach
  // the normalizer that exists to refuse it. Comparing against the re-serialized
  // origin restores what parsing threw away, and also refuses a path, query or
  // fragment. Browsers only ever send a bare origin, so nothing legitimate is
  // lost. My own adversarial case caught this — the first version accepted
  // `https://user@<bound-host>`.
  if (origin !== originUrl.origin) return false;

  // A custom tenant domain is served over TLS. Admitting http here would let a
  // network attacker on the same hostname mount the very request this control
  // exists to stop; outside production the localhost allowance above already
  // covers local development.
  if (process.env.NODE_ENV === "production" && originUrl.protocol !== "https:") {
    return false;
  }

  // Both sides go through the same fail-closed normalizer the domain directory
  // is keyed by, so a smuggled or malformed value yields null and is refused
  // rather than being cleaned up into a hostname.
  //
  // The comparison is by hostname, not host:port. A port difference on one
  // registered hostname is still the same tenant's domain — the boundary this
  // guards is a *different* hostname — and Host arrives with or without an
  // explicit port depending on the proxy in front.
  const originHost = normalizeHostHeader(originUrl.host);
  const requestHost = normalizeHostHeader(req.headers.get("host"));
  if (!originHost || !requestHost || originHost !== requestHost) return false;

  const lookup = await lookupTenantHost();
  if (!lookup) return false;
  return lookup(originHost) !== null;
}
