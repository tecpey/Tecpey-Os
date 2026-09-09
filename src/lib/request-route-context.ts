import { resolveLocalePath } from "@/i18n/config";

export const REQUEST_ROUTE_CONTEXT_HEADER = "x-tecpey-request-path";

const PROFILE_FREE_SEMANTIC_ROUTES = new Set([
  "/academy/community/instructor",
  "/academy/mentor-coach",
  "/academy/trading-arena",
]);

/**
 * Profile-free behavior follows semantic route identity, not duplicated locale
 * prefixes. This keeps the policy correct when additional TecPey locales become
 * active without creating a separate allowlist for every language.
 */
export function isProfileFreeRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PROFILE_FREE_SEMANTIC_ROUTES.has(resolveLocalePath(pathname).path);
}
