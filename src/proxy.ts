import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";

const PUBLIC_ACADEMY_PATHS = new Set([
  "/academy/login",
  "/academy/signup",
  "/academy/free",
  "/en/academy/login",
  "/en/academy/signup",
  "/en/academy/free",
]);

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const directives = [
    "default-src 'self'",
    // 'nonce-{nonce}' allows Next.js-generated inline scripts.
    // 'strict-dynamic' allows scripts loaded by trusted same-origin bundles.
    // 'unsafe-eval' is required only in development (React DevTools / error overlays).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // 'unsafe-inline' is unavoidable: Next.js inlineCss injects <style> tags and React SSR
    // emits inline style attributes. Nonces on style-src are not effective for style= attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // 'self' covers same-origin /api/* calls.
    // https: / wss: / ws: allow the backend API (NEXT_PUBLIC_API_BACKEND_URL) and
    // WebSocket server (NEXT_PUBLIC_API_SOCKET_URL) without hard-coding environment URLs.
    "connect-src 'self' https: wss: ws:",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ];
  return directives.join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const isAcademy =
    pathname.startsWith("/academy/") || pathname.startsWith("/en/academy/");

  if (isAcademy && !PUBLIC_ACADEMY_PATHS.has(pathname)) {
    const session = await getCanonicalSession(request);
    if (!session.isAcademyUser) {
      const loginPath = pathname.startsWith("/en/")
        ? "/en/academy/login"
        : "/academy/login";
      const url = new URL(loginPath, request.url);
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/* (API routes — CSP is irrelevant for JSON responses)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * Prefetch requests are excluded via the `missing` filter to avoid
     * generating a new nonce for prefetches that never render a page.
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    // Still protect academy routes even if the pattern above were narrowed.
    "/academy/:path+",
    "/en/academy/:path+",
  ],
};
