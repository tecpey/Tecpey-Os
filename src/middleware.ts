import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";

// Pages inside /academy that do not require a valid session.
const PUBLIC_ACADEMY_PATHS = new Set([
  "/academy/login",
  "/academy/signup",
  "/academy/free",
  "/en/academy/login",
  "/en/academy/signup",
  "/en/academy/free",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAcademy =
    pathname.startsWith("/academy/") || pathname.startsWith("/en/academy/");

  if (!isAcademy) return NextResponse.next();
  if (PUBLIC_ACADEMY_PATHS.has(pathname)) return NextResponse.next();

  const session = await getCanonicalSession(request);

  if (!session.isAcademyUser) {
    const loginPath = pathname.startsWith("/en/")
      ? "/en/academy/login"
      : "/academy/login";
    const url = new URL(loginPath, request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/academy/:path+", "/en/academy/:path+"],
};
