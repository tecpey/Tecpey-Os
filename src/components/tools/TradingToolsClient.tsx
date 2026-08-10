"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { X, ExternalLink, Search, Globe, ShieldCheck, Sparkles } from "lucide-react";
import {
  getFeaturedTraderTools,
  getRankedTraderTools,
  type RankedTraderTool,
} from "@/lib/trading-tools-growth";

type Locale = "fa" | "en";
type Tool = RankedTraderTool;

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const STR = {
  fa: {
    badge: "جعبه ابزار حرفه‌ای تک‌پی",
    title: "ابزارهای حرفه‌ای برای تحلیل، امنیت و تحقیق رمزارز",
    subtitle: "هر ابزار با توضیح فارسی، کاربرد، پلتفرم‌ها، لینک رسمی و امتیاز رشد کنترل‌شده معرفی شده است.",
    featuredTitle: "۵ ابزار منتخب برای شروع امن‌تر",
    featuredSubtitle:
      "مرتب‌سازی بر اساس امنیت، کاربرد آموزشی، اهمیت دسته و کامل بودن لینک رسمی انجام می‌شود؛ نه صرفاً محبوبیت.",
    rankingLabel: "امتیاز تک‌پی",
    governedLabel: "رتبه‌بندی کنترل‌شده",
    safeUseLabel: "استفاده آموزشی و ریسک‌محور",
    searchPlaceholder: "جستجوی ابزار...",
    searchLabel: "جستجوی ابزار",
    all: "همه",
    count: (n: number) => `${n} ابزار`,
    empty: "ابزاری با این جستجو پیدا نشد.",
    platforms: "پلتفرم‌ها",
    web: "وب",
    pros: "مزایا",
    cons: "محدودیت‌ها",
    tutorial: "آموزش سریع استفاده",
    officialSite: "سایت رسمی",
    leaving: (host: string) => `خروج از تک‌پی به ${host}`,
    close: "بستن",
    disclaimer:
      "این معرفی آموزشی است و توصیه مالی یا تأیید ابزار نیست. پیش از استفاده، مجوزها، هزینه‌ها و ریسک‌های هر ابزار را خودت بررسی کن.",
  },
  en: {
    badge: "TecPey Trader Toolbox",
    title: "Professional tools for crypto analysis, security and research",
    subtitle: "Each tool includes a description, use case, platforms, official links and a governed growth score.",
    featuredTitle: "Five featured tools for safer onboarding",
    featuredSubtitle:
      "Ordering prioritizes safety, educational usefulness, category importance and official-link completeness ahead of raw popularity.",
    rankingLabel: "TecPey score",
    governedLabel: "Governed ranking",
    safeUseLabel: "Educational, risk-aware use",
    searchPlaceholder: "Search tools...",
    searchLabel: "Search tools",
    all: "All",
    count: (n: number) => `${n} tools`,
    empty: "No tools match your search.",
    platforms: "Platforms",
    web: "Web",
    pros: "Strengths",
    cons: "Limitations",
    tutorial: "Quick start",
    officialSite: "Official site",
    leaving: (host: string) => `Leave TecPey for ${host}`,
    close: "Close",
    disclaimer:
      "This is educational, not financial advice or an endorsement. Check each tool's permissions, pricing and risks yourself before using it.",
  },
} as const;

const TRADER_TOOLS = getRankedTraderTools();
const FEATURED_TOOLS = getFeaturedTraderTools(5);

function formatRankScore(score: number): string {
  return `${Math.round(score * 100)}`;
}

export default function TradingToolsClient({ locale = "fa" }: { locale?: Locale }) {
  const isEn = locale === "en";
  const t = STR[isEn ? "en" : "fa"];
  const [active, setActive] = useState<Tool | null>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const tool of TRADER_TOOLS) {
      if (!seen.has(tool.categoryKey)) {
        seen.set(tool.categoryKey, isEn ? tool.categoryEn : tool.categoryFa);
      }
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [isEn]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return TRADER_TOOLS.filter((tool) => {
      if (category !== "all" && tool.categoryKey !== category) return false;
      if (!s) return true;
      return [tool.name, tool.categoryFa, tool.categoryEn, tool.summaryFa, tool.summaryEn]
        .join(" ")
        .toLowerCase()
        .includes(s);
    });
  }, [q, category]);

  // Accessible dialog: close on Escape, move focus into the dialog on open,
  // trap Tab/Shift+Tab inside it so keyboard focus cannot reach the obscured
  // page behind the modal, and return focus to the invoking card on close.
  useEffect(() => {
    if (!active) return;
    const previouslyFocused = triggerRef.current;
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActive(null);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (activeEl === first || activeEl === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  const platforms = active
    ? [t.web, active.ios ? "iOS" : null, active.android ? "Android" : null].filter(Boolean)
    : [];

  return (
    <main
      dir={isEn ? "ltr" : "rtl"}
      className="min-h-screen bg-[color:var(--tp-bg)] px-4 py-16 text-[color:var(--tp-text)] sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <section className="rounded-[38px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.18),transparent_34%),rgba(255,255,255,.045)] p-6 shadow-2xl shadow-cyan-500/10 lg:p-9">
          <div className="inline-flex rounded-full bg-cyan-500/10 px-4 py-2 text-xs font-black text-cyan-500">
            {t.badge}
          </div>
          <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl">{t.title}</h1>
          <p className="mt-4 max-w-4xl text-base font-bold leading-8 text-[color:var(--tp-muted)]">{t.subtitle}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-400/10 px-4 py-3">
              <ShieldCheck className="h-5 w-5 text-cyan-500" aria-hidden="true" />
              <span className="text-sm font-black text-[color:var(--tp-text)]">{t.safeUseLabel}</span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-cyan-300/15 bg-white/55 px-4 py-3 dark:bg-white/[0.05]">
              <Sparkles className="h-5 w-5 text-cyan-500" aria-hidden="true" />
              <span className="text-sm font-black text-[color:var(--tp-text)]">{t.governedLabel}</span>
            </div>
          </div>
          <div className="mt-6 flex max-w-xl items-center gap-3 rounded-2xl border border-cyan-300/15 bg-white/70 px-4 py-3 dark:bg-white/[0.06]">
            <Search className="h-5 w-5 text-cyan-500" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchLabel}
              className="w-full bg-transparent text-sm font-bold outline-none"
            />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label={isEn ? "Categories" : "دسته‌بندی‌ها"}>
            <button
              type="button"
              onClick={() => setCategory("all")}
              aria-pressed={category === "all"}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${category === "all" ? "border-cyan-400 bg-cyan-500/15 text-cyan-600 dark:text-cyan-200" : "border-cyan-300/20 text-[color:var(--tp-muted)] hover:border-cyan-300/45"}`}
            >
              {t.all}
            </button>
            {categories.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                aria-pressed={category === c.key}
                className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${category === c.key ? "border-cyan-400 bg-cyan-500/15 text-cyan-600 dark:text-cyan-200" : "border-cyan-300/20 text-[color:var(--tp-muted)] hover:border-cyan-300/45"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs font-black text-[color:var(--tp-muted)]" aria-live="polite">{t.count(list.length)}</p>
        </section>

        <section className="mt-8 rounded-[30px] border border-cyan-300/15 bg-white/70 p-5 shadow-xl shadow-cyan-500/5 dark:bg-white/[0.045]">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-black text-[color:var(--tp-text)]">{t.featuredTitle}</h2>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{t.featuredSubtitle}</p>
            </div>
            <span className="inline-flex w-fit rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-black text-cyan-600 dark:text-cyan-200">
              {t.rankingLabel}
            </span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {FEATURED_TOOLS.map((tool, index) => (
              <button
                key={tool.name}
                type="button"
                onClick={(e) => {
                  triggerRef.current = e.currentTarget;
                  setActive(tool);
                }}
                aria-haspopup="dialog"
                className="group rounded-2xl border border-cyan-300/15 bg-[color:var(--tp-surface)] p-4 text-start transition hover:-translate-y-0.5 hover:border-cyan-300/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-500 text-xs font-black text-white">
                    {index + 1}
                  </span>
                  <span className="text-xs font-black text-cyan-600 dark:text-cyan-200">
                    {formatRankScore(tool.growthRank.rankScore)}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-black text-[color:var(--tp-text)]">{tool.name}</h3>
                <p className="mt-1 text-xs font-black text-cyan-600 dark:text-cyan-200">
                  {isEn ? tool.categoryEn : tool.categoryFa}
                </p>
              </button>
            ))}
          </div>
        </section>

        {list.length === 0 ? (
          <p className="mt-10 rounded-[28px] border border-cyan-300/15 bg-white/60 p-8 text-center text-sm font-black text-[color:var(--tp-muted)] dark:bg-white/[0.04]">
            {t.empty}
          </p>
        ) : (
          <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {list.map((tool) => (
              <button
                key={tool.name}
                onClick={(e) => {
                  triggerRef.current = e.currentTarget;
                  setActive(tool);
                }}
                aria-haspopup="dialog"
                className="text-start rounded-[28px] border border-cyan-300/15 bg-white/80 p-5 shadow-xl shadow-cyan-500/5 transition hover:-translate-y-1 hover:border-cyan-300/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 dark:bg-white/[0.055]"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border border-cyan-300/30 bg-cyan-400/10">
                    {/* eslint-disable-next-line @next/next/no-img-element -- #162: tool-provider icons use reviewed external URLs outside the Next image allowlist. */}
                    <img
                      src={tool.logoUrl}
                      alt=""
                      className="h-8 w-8"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div>
                    <h2 className="text-lg font-black">{tool.name}</h2>
                    <p className="text-xs font-black text-cyan-500">{isEn ? tool.categoryEn : tool.categoryFa}</p>
                  </div>
                </div>
                <p className="mt-4 line-clamp-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                  {isEn ? tool.summaryEn : tool.summaryFa}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-cyan-300/15 pt-3">
                  <span className="text-[11px] font-black text-[color:var(--tp-muted)]">{t.rankingLabel}</span>
                  <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[11px] font-black text-cyan-600 dark:text-cyan-200">
                    {formatRankScore(tool.growthRank.rankScore)}
                  </span>
                </div>
              </button>
            ))}
          </section>
        )}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-[120] bg-slate-950/72 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setActive(null)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tp-tool-title"
            tabIndex={-1}
            dir={isEn ? "ltr" : "rtl"}
            className="mx-auto flex max-h-[88dvh] max-w-3xl flex-col overflow-hidden rounded-[32px] border border-cyan-300/20 bg-slate-950 text-white shadow-[0_32px_120px_rgba(0,0,0,.65)] focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <h3 id="tp-tool-title" className="text-2xl font-black">{active.name}</h3>
                <p className="text-xs font-bold text-cyan-200">{isEn ? active.categoryEn : active.categoryFa}</p>
                <p className="mt-1 text-[11px] font-black text-slate-400">
                  {t.rankingLabel}: {formatRankScore(active.growthRank.rankScore)}
                </p>
              </div>
              <button
                onClick={() => setActive(null)}
                aria-label={t.close}
                className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <p className="text-sm font-bold leading-8 text-slate-200">{isEn ? active.articleEn : active.articleFa}</p>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">{t.platforms}:</span>
                {platforms.map((p) => (
                  <span key={p as string} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-slate-200">{p}</span>
                ))}
              </div>

              {!isEn && active.prosFa?.length ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-emerald-400/10 p-4">
                    <h4 className="font-black text-emerald-200">{t.pros}</h4>
                    <ul className="mt-2 space-y-2 text-sm">
                      {active.prosFa.map((x) => (
                        <li key={x}>• {x}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl bg-amber-400/10 p-4">
                    <h4 className="font-black text-amber-200">{t.cons}</h4>
                    <ul className="mt-2 space-y-2 text-sm">
                      {active.consFa.map((x) => (
                        <li key={x}>• {x}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {!isEn && active.tutorialFa?.length ? (
                <div className="mt-5 rounded-2xl bg-white/5 p-4">
                  <h4 className="font-black">{t.tutorial}</h4>
                  <ul className="mt-2 space-y-2 text-sm">
                    {active.tutorialFa.map((x) => (
                      <li key={x}>• {x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs font-bold leading-6 text-amber-50">
                {t.disclaimer}
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={active.site}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-black text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  title={t.leaving(hostOf(active.site))}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {t.officialSite}
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold">
                    <Globe className="h-3 w-3" aria-hidden="true" />
                    {hostOf(active.site)}
                  </span>
                </a>
                {active.ios ? (
                  <a
                    href={active.ios}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                    title={t.leaving(hostOf(active.ios))}
                  >
                    iOS
                  </a>
                ) : null}
                {active.android ? (
                  <a
                    href={active.android}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                    title={t.leaving(hostOf(active.android))}
                  >
                    Android
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
