import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

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
