"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isEnglish = pathname.startsWith("/en");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-11 min-w-11 items-center justify-center rounded-[var(--tp-radius-control)] border border-[color:var(--tp-border)] bg-[color:var(--tp-card)] px-3"
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const currentLabel = isEnglish
    ? isDark
      ? "Dark"
      : "Light"
    : isDark
      ? "تیره"
      : "روشن";
  const actionLabel = isEnglish
    ? `Switch to ${nextTheme} mode`
    : `تغییر به حالت ${nextTheme === "dark" ? "تیره" : "روشن"}`;

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      className="tecpey-icon-button tecpey-pressable h-11 gap-2 px-2.5 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--tp-bg)]"
      aria-label={actionLabel}
      aria-pressed={isDark}
      title={actionLabel}
    >
      {isDark ? (
        <span className="tecpey-icon-shell" data-size="xs" data-tone="neutral" aria-hidden="true"><Moon className="h-4 w-4" aria-hidden="true" /></span>
      ) : (
        <span className="tecpey-icon-shell" data-size="xs" data-tone="warning" aria-hidden="true"><Sun className="h-4 w-4" aria-hidden="true" /></span>
      )}
      <span className="hidden sm:inline">{currentLabel}</span>
    </button>
  );
}
