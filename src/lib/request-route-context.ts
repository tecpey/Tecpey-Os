export const REQUEST_ROUTE_CONTEXT_HEADER = "x-tecpey-request-path";

const PROFILE_FREE_ROUTES = new Set([
  "/academy/community/instructor",
  "/academy/mentor-coach",
  "/academy/trading-arena",
  "/en/academy/mentor-coach",
  "/en/academy/trading-arena",
]);

export function isProfileFreeRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return PROFILE_FREE_ROUTES.has(normalized);
}
