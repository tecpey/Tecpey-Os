import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // HSTS: tell browsers to always use HTTPS for 2 years; covers subdomains.
  // Browsers ignore this header on plain HTTP, so it is safe to set unconditionally.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Disable the legacy XSS auditor (per OWASP — the auditor itself introduced vulnerabilities).
  { key: "X-XSS-Protection", value: "0" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  experimental: {
    // Inlines Tailwind CSS into HTML on first load — removes render-blocking stylesheet request,
    // improving LCP for first-time visitors. Trade-off: no CSS cache for returning visitors,
    // but Tailwind output is small enough that this is net positive.
    inlineCss: true,
  },

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
