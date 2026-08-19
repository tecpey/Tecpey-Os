"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { resolveActiveIndex } from "./living-nav-active";

type LivingNavItem = {
  label: string;
  href: string;
  match: string[];
  Icon: LucideIcon;
};

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
  const activeIndex = resolveActiveIndex(pathname, items);
  const hasActive = activeIndex >= 0;
  const visualActiveIndex =
    dir === "rtl" ? items.length - 1 - activeIndex : activeIndex;

  return (
    <nav
      aria-label={ariaLabel}
      dir={dir}
      className="tecpey-living-mobile-nav fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[80] lg:hidden"
    >
      <div className="tecpey-living-mobile-nav__bar">
        {hasActive ? (
          <span
            className="tecpey-living-mobile-nav__halo"
            aria-hidden="true"
            style={{
              width: `calc(100% / ${items.length})`,
              transform: `translate3d(${visualActiveIndex * 100}%, 0, 0)`,
            }}
          >
            <span className="tecpey-living-mobile-nav__ring" />
          </span>
        ) : null}
        <div
          className="tecpey-living-mobile-nav__items"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {items.map((item, index) => {
            // Exactly the first matching item is active, so the highlight and the
            // halo agree and only one link carries aria-current="page".
            const active = index === activeIndex;
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
