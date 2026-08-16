"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

type LivingNavItem = {
  label: string;
  href: string;
  match: string[];
  Icon: LucideIcon;
};

function isActivePath(pathname: string, item: LivingNavItem) {
  return item.match.some((match) =>
    pathname === match || pathname.startsWith(`${match}/`),
  );
}

export function LivingMobileNavigation({
  ariaLabel,
  items,
  dir = "rtl",
}: {
  ariaLabel: string;
  items: LivingNavItem[];
  dir?: "rtl" | "ltr";
}) {
  const pathname = usePathname();
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => isActivePath(pathname, item)),
  );

  return (
    <nav
      aria-label={ariaLabel}
      dir={dir}
      className="tecpey-living-mobile-nav fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[80] lg:hidden"
    >
      <div className="tecpey-living-mobile-nav__bar">
        <span
          className="tecpey-living-mobile-nav__halo"
          aria-hidden="true"
          style={{
            insetInlineStart: `${(activeIndex / items.length) * 100}%`,
            width: `${100 / items.length}%`,
          }}
        >
          <span className="tecpey-living-mobile-nav__ring" />
        </span>
        <div
          className="tecpey-living-mobile-nav__items"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {items.map((item) => {
            const active = isActivePath(pathname, item);
            const Icon = item.Icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="tecpey-living-mobile-nav__item"
                data-active={active ? "true" : "false"}
              >
                <span className="tecpey-living-mobile-nav__icon">
                  <Icon className="h-[1.2rem] w-[1.2rem]" aria-hidden />
                </span>
                <span className="tecpey-living-mobile-nav__label">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
