import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import {
  REQUEST_ROUTE_CONTEXT_HEADER,
} from "@/lib/request-route-context";
import { TRACE_REQUEST_HEADER, TRACE_RESPONSE_HEADER, generateRequestId } from "@/lib/trace";

const PUBLIC_ACADEMY_PATHS = new Set([
  "/academy/login",
  "/academy/signup",
  "/academy/free",
  "/en/academy/login",
  "/en/academy/signup",
  "/en/academy/free",
]);

/**
 * Build the connect-src directive using explicit env-var URLs where available.
 * Falls back to broad https:/wss:/ws: only when backend URLs are not configured —
 * this case is logged as a warning in development (not production, to avoid noise).
 *
 * Remaining risk: if additional frontend fetch calls target external APIs not listed
 * here, they will be blocked when env vars are configured. Add explicit origins to
 * NEXT_PUBLIC_EXTRA_CONNECT_SRC (space-separated) as an escape hatch.
 */
function buildConnectSrc(): string {
  const parts: string[] = ["'self'"];
  const backendUrl = process.env.NEXT_PUBLIC_API_BACKEND_URL;
  const socketUrl = process.env.NEXT_PUBLIC_API_SOCKET_URL;
  const extraSrc = process.env.NEXT_PUBLIC_EXTRA_CONNECT_SRC;

  if (backendUrl && !backendUrl.includes("CHANGE_ME")) {
    try { parts.push(new URL(backendUrl).origin); } catch { parts.push("https:"); }
  } else {
    parts.push("https:");
  }

  if (socketUrl && !socketUrl.includes("CHANGE_ME")) {
    try {
      const u = new URL(socketUrl);
      // normalise to wss:// origin
      parts.push(`${u.protocol === "ws:" ? "ws:" : "wss:"}//${u.host}`);
    } catch {
      parts.push("wss:", "ws:");
    }
  } else {
    parts.push("wss:", "ws:");
  }

  if (extraSrc) {
    for (const src of extraSrc.trim().split(/\s+/)) {
      if (src) parts.push(src);
    }
  }

  return `connect-src ${parts.join(" ")}`;
}

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
    buildConnectSrc(),
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

  const requestId = generateRequestId();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TRACE_REQUEST_HEADER, requestId);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  // Always overwrite the client-provided value. Server components may trust only
  // the route context established by this proxy invocation.
  requestHeaders.set(REQUEST_ROUTE_CONTEXT_HEADER, pathname);

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
  response.headers.set(TRACE_RESPONSE_HEADER, requestId);
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
