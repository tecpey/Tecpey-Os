// Pure active-state resolution for the living mobile navigation, split out from
// the "use client" component so it can be unit-tested without a DOM or the
// next/navigation runtime. The component renders exactly what these functions
// decide, so testing them is testing the navigation's correctness.

export type LivingNavMatch = { match: string[] };

/**
 * True when `pathname` is one of the item's match paths, or nested beneath one
 * (`/a` matches `/a` and `/a/b`, but not `/ab`).
 */
export function isActivePath(pathname: string, item: LivingNavMatch): boolean {
  return item.match.some(
    (candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`),
  );
}

/**
 * Index of the single active item — the FIRST item whose match set contains the
 * pathname — or -1 when none match. Returning the first match (rather than
 * marking every matching item active) guarantees exactly one active item even
 * when two items' match sets overlap, keeping the highlighted tab and the moving
 * halo in agreement and leaving a single aria-current="page" in the DOM. -1 is
 * preserved, not coerced to 0, so an unmatched route highlights nothing rather
 * than falsely lighting the first tab.
 */
export function resolveActiveIndex(
  pathname: string,
  items: readonly LivingNavMatch[],
): number {
  return items.findIndex((item) => isActivePath(pathname, item));
}
