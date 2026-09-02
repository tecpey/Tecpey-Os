#!/usr/bin/env node
// SB-014 authority guard.
//
// Nginx auth-zone rate limiting is deployment configuration, not application
// code, so nothing in the test suite ever exercised it — the record for SB-014
// was honest about that: "Not verified here... not asserted by any repository
// gate." This is that gate.
//
// A config that merely *declares* a tighter zone is not the same as a config
// that *applies* it to every credential/session endpoint. Nginx location
// matching has a specific trap here: a plain-prefix `location /api/ {}` with
// `^~` would silently win over any regex auth location placed after it,
// leaving the declared zone unused while the check that only greps for its
// existence stays green. That is exactly the "control that reports a
// capability instead of providing it" shape this guard is built to catch, so
// it compiles the auth location's own regex and tests it against real route
// paths rather than trusting that the zone name appears somewhere in the file.
//
// The set of "this is an auth path" routes is derived from the live
// src/app/api tree, not hand-listed: a route belongs to the auth surface if
// any of its path segments is exactly "auth" (catches /api/auth/*,
// /api/academy/auth/*, /api/command-center/auth/*, and any future namespace
// following the same convention), or if its first segment is exactly
// "academy-auth". A segment equal to "auth-providers" does not match "auth",
// so admin auth-provider configuration is correctly left out of the tighter
// credential zone without special-casing it.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CONF_FILES = ["deploy/nginx/tecpey.conf", "deploy/nginx/tecpey.ssl.conf"];
const API_ROOT = "src/app/api";

const failures = [];

function listRouteFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listRouteFiles(full));
    } else if (entry === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

// Real API route paths, e.g. "auth/2fa/verify", "academy-auth",
// "command-center/auth-providers/review-requests".
const routePaths = listRouteFiles(API_ROOT).map((path) =>
  path.slice(API_ROOT.length + 1, -"/route.ts".length).replaceAll("\\", "/"),
);
if (routePaths.length < 50) {
  failures.push(`only found ${routePaths.length} API routes under ${API_ROOT} — route discovery is broken`);
}

function isAuthSurfaceRoute(routePath) {
  const segments = routePath.split("/");
  if (segments[0] === "academy-auth") return true;
  return segments.includes("auth");
}

/** The shortest path prefix that identifies a route as belonging to the auth surface. */
function authPrefixFor(routePath) {
  const segments = routePath.split("/");
  if (segments[0] === "academy-auth") return "academy-auth";
  const authIndex = segments.indexOf("auth");
  return `${segments.slice(0, authIndex + 1).join("/")}/`;
}

const authRoutes = routePaths.filter(isAuthSurfaceRoute);
if (authRoutes.length === 0) {
  failures.push("no auth-surface routes were found — the discovery rule itself is broken");
}

const authPrefixes = [...new Set(authRoutes.map(authPrefixFor))];

// Sanity fixtures: paths that must NOT be treated as auth-surface, so a
// regex broad enough to trivially "cover" everything (e.g. `.*`) is caught.
const nonAuthSample = ["orders", "support-message", "community/profile", "notifications/read"];
for (const sample of nonAuthSample) {
  if (isAuthSurfaceRoute(sample)) {
    failures.push(`discovery rule fired on a known non-auth route fixture "${sample}" — the rule is too broad`);
  }
}
// command-center/auth-providers/review-requests must stay OUT of the auth
// surface: it is admin configuration for OAuth providers, already behind an
// authenticated admin session, not a credential-verification endpoint. A
// segment equal to "auth-providers" is not equal to "auth", so this should
// never match — asserted explicitly because it is the one real route in the
// tree that sits one character away from a false positive.
if (isAuthSurfaceRoute("command-center/auth-providers/review-requests")) {
  failures.push('"command-center/auth-providers/review-requests" matched the auth-surface rule — it must not');
}

function parseZones(source, label) {
  const zones = new Map();
  const pattern = /limit_req_zone\s+\S+\s+zone=([A-Za-z0-9_]+):\S+\s+rate=(\d+)r\/(s|m);/g;
  for (const match of source.matchAll(pattern)) {
    const [, name, count, unit] = match;
    const perSecond = unit === "s" ? Number(count) : Number(count) / 60;
    zones.set(name, perSecond);
  }
  if (!zones.has("tecpey_api")) failures.push(`${label}: tecpey_api zone is missing — cannot compare against it`);
  if (!zones.has("tecpey_auth")) failures.push(`${label}: tecpey_auth zone is missing`);
  return zones;
}

function extractAuthLocationRegex(source, label) {
  // The location whose body references `zone=tecpey_auth`, not merely a
  // location that happens to be regex-shaped — declaring the zone somewhere
  // it is never applied would pass a check that only looked for the zone name.
  const locationPattern = /location\s+(=|~\*|~|\^~)?\s*([^\s{]+)\s*\{([^}]*)\}/g;
  for (const match of source.matchAll(locationPattern)) {
    const [, modifier, pattern, body] = match;
    if (!/limit_req\s+zone=tecpey_auth\b/.test(body)) continue;
    if (modifier !== "~" && modifier !== "~*") {
      failures.push(
        `${label}: the tecpey_auth location must be a regex location ("~" or "~*"), found "${modifier ?? "(prefix)"} ${pattern}" — a prefix location can be shadowed by /api/ depending on declaration order`,
      );
      return null;
    }
    try {
      return new RegExp(pattern, modifier === "~*" ? "i" : "");
    } catch (error) {
      failures.push(`${label}: could not compile the tecpey_auth location pattern "${pattern}": ${error.message}`);
      return null;
    }
  }
  failures.push(`${label}: no location block applies limit_req zone=tecpey_auth`);
  return null;
}

/**
 * The general /api/ prefix location must not carry `^~`. That modifier tells
 * nginx to stop checking regex locations once the longest-matching prefix
 * location is found, which would make the tecpey_auth regex location
 * unreachable for every request — the zone would exist, be syntactically
 * wired to a location, and still never run.
 */
function assertGeneralApiLocationIsPlainPrefix(source, label) {
  const match = /location\s+(\^~)?\s*\/api\/\s*\{/.exec(source);
  if (!match) {
    failures.push(`${label}: no plain "location /api/" block found to check for a shadowing ^~ modifier`);
    return;
  }
  if (match[1] === "^~") {
    failures.push(
      `${label}: "location /api/" is declared with ^~, which would make it win over the tecpey_auth regex location and silently disable auth-specific rate limiting`,
    );
  }
}

for (const confPath of CONF_FILES) {
  const source = readFileSync(confPath, "utf8");
  const zones = parseZones(source, confPath);

  if (zones.has("tecpey_api") && zones.has("tecpey_auth")) {
    if (zones.get("tecpey_auth") >= zones.get("tecpey_api")) {
      failures.push(
        `${confPath}: tecpey_auth (${zones.get("tecpey_auth")}r/s) must be strictly tighter than tecpey_api (${zones.get("tecpey_api")}r/s)`,
      );
    }
  }

  assertGeneralApiLocationIsPlainPrefix(source, confPath);

  const authRegex = extractAuthLocationRegex(source, confPath);
  if (authRegex) {
    for (const prefix of authPrefixes) {
      const candidate = `/api/${prefix}${prefix.endsWith("/") ? "sample-endpoint" : ""}`;
      if (!authRegex.test(candidate)) {
        failures.push(
          `${confPath}: the tecpey_auth location does not cover "${candidate}" — a real auth route would fall through to the looser tecpey_api zone`,
        );
      }
    }
    for (const sample of nonAuthSample) {
      const candidate = `/api/${sample}`;
      if (authRegex.test(candidate)) {
        failures.push(
          `${confPath}: the tecpey_auth location matches "${candidate}", a non-auth route — the pattern is broader than the auth surface`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Nginx auth rate-limit authority check failed:\n");
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  `Nginx auth rate-limit authority check passed: ${authRoutes.length} auth-surface routes across ` +
    `${authPrefixes.length} prefixes are covered by a dedicated, strictly tighter tecpey_auth zone in both ` +
    `${CONF_FILES.join(" and ")}, and neither config can silently shadow it with a ^~ general API location.`,
);
