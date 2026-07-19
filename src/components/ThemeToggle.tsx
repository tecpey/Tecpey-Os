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
        className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-black/10 bg-white/55 px-3 dark:border-white/10 dark:bg-white/5"
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
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-black/10 bg-white/65 px-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-cyan-400/45 hover:bg-cyan-400/10 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--tp-bg)] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:text-cyan-200"
      aria-label={actionLabel}
      aria-pressed={isDark}
      title={actionLabel}
    >
      {isDark ? (
        <Moon className="h-[18px] w-[18px]" aria-hidden="true" />
      ) : (
        <Sun className="h-[18px] w-[18px]" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{currentLabel}</span>
    </button>
  );
}
