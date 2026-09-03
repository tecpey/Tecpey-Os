import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { resolveImmutableBuildCommit } from "./scripts/resolve-build-identity";

const withNextIntl = createNextIntlPlugin();

const immutableBuildCommit = resolveImmutableBuildCommit();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // DENY aligns with CSP frame-ancestors 'none' in proxy.ts — consistent policy across legacy
  // and modern browsers. SAMEORIGIN contradicted the stricter CSP directive.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
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
  // Cross-origin isolation hardening: our documents get their own browsing
  // context group and our responses may not be embedded cross-origin. This
  // complements CSP frame-ancestors and blocks cross-origin window references
  // and resource embedding ( Spectre-class and UI-redress mitigations ).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Nginx buffers proxied responses by default, collecting an entire
  // streamed React response before forwarding a single byte to the
  // browser — silently erasing every benefit of Suspense-based streaming
  // (see src/app/layout.tsx). X-Accel-Buffering: no is the header Nginx
  // itself recognizes to disable buffering for that one response, without
  // a broader `proxy_buffering off` in nginx.conf that would also remove
  // Nginx's slow-client protection for every other response through the
  // same location block.
  { key: "X-Accel-Buffering", value: "no" },
];

const privateNoStoreHeaders = [
  {
    key: "Cache-Control",
    value: "private, no-cache, no-store, max-age=0, must-revalidate",
  },
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
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      ...[
        "/academy/login",
        "/academy/signup",
        "/en/academy/login",
        "/en/academy/signup",
      ].map((source) => ({ source, headers: privateNoStoreHeaders })),
    ];
  },
};

export default withNextIntl(nextConfig);
