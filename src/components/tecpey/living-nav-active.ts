export type LivingNavMatch = { match: string[]; exact?: boolean };

export function isActivePath(pathname: string, item: LivingNavMatch): boolean {
  return item.match.some((candidate) => pathname === candidate ||
    (!item.exact && pathname.startsWith(`${candidate}/`)));
}

/** Most specific route wins; ties keep the first item. Never invent an active tab. */
export function resolveActiveIndex(pathname: string, items: readonly LivingNavMatch[]): number {
  let index = -1;
  let specificity = -1;
  items.forEach((item, candidateIndex) => {
    for (const path of item.match) {
      if (isActivePath(pathname, { match: [path], exact: item.exact }) && path.length > specificity) {
        index = candidateIndex;
        specificity = path.length;
      }
    }
  });
  return index;
}
