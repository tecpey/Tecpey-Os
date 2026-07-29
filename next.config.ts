import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();
const exactCommitPattern = /^[0-9a-f]{40}$/;

function resolveImmutableBuildCommit(): string {
  const configured = process.env.TECPEY_BUILD_COMMIT_SHA?.trim();
  const commit =
    configured ??
    execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }).trim();
  if (!exactCommitPattern.test(commit)) {
    throw new Error("TECPEY_BUILD_COMMIT_SHA must be an exact lowercase 40-character Git SHA");
  }
  return commit;
}

const immutableBuildCommit = resolveImmutableBuildCommit();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // DENY aligns with CSP frame-ancestors 'none' in proxy.ts — consistent policy across legacy
  // and modern browsers. SAMEORIGIN contradicted the stricter CSP directive.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Deny all sensor/hardware APIs not used by TecPey.
  // interest-cohort=() opts out of FLoC/Topics ad tracking.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()",
  },
  // HSTS: tell browsers to always use HTTPS for 2 years; covers subdomains.
  // Browsers ignore this header on plain HTTP, so it is safe to set unconditionally.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Disable the legacy XSS auditor (per OWASP — the auditor itself introduced vulnerabilities).
  { key: "X-XSS-Protection", value: "0" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Values declared through Next's env config are replaced in the compiled
  // server/client artifacts. Runtime EnvironmentFile changes cannot alter this
  // release identity without rebuilding the artifact.
  env: {
    TECPEY_IMMUTABLE_BUILD_COMMIT_SHA: immutableBuildCommit,
  },

  // Public pages use request-time rendering so Next.js can propagate the CSP
  // nonce to framework and hydration scripts. Keep compiled CSS as cacheable
  // same-origin assets: experimental inlineCss on the large dynamic landing
  // caused unbounded per-request heap growth under real browser navigation.
  turbopack: {
    root: __dirname,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
