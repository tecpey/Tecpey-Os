"use client";
import { useMemo, useState } from "react";
import { X, ExternalLink, Search } from "lucide-react";
import tools from "@/data/traderTools.json";
type Locale = "fa" | "en";
type Tool = (typeof tools)[number];
export default function TradingToolsClient({
  locale = "fa",
}: {
  locale?: Locale;
}) {
  const isEn = locale === "en";
  const [active, setActive] = useState<Tool | null>(null);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.toLowerCase();
    return tools.filter(
      (t) =>
        !s ||
        [t.name, t.categoryFa, t.summaryFa].join(" ").toLowerCase().includes(s),
    );
  }, [q]);
  return (
    <main
      dir={isEn ? "ltr" : "rtl"}
      className="min-h-screen bg-[color:var(--tp-bg)] px-4 py-16 text-[color:var(--tp-text)] sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <section className="rounded-[38px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.18),transparent_34%),rgba(255,255,255,.045)] p-6 shadow-2xl shadow-cyan-500/10 lg:p-9">
          <div className="inline-flex rounded-full bg-cyan-500/10 px-4 py-2 text-xs font-black text-cyan-500">
            {isEn ? "Trader Toolbox Pro" : "جعبه ابزار حرفه‌ای تک‌پی"}
          </div>
          <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl">
            {isEn
              ? "Professional crypto tools"
              : "ابزارهای حرفه‌ای برای تحلیل، امنیت و تحقیق رمزارز"}
          </h1>
          <p className="mt-4 max-w-4xl text-base font-bold leading-8 text-[color:var(--tp-muted)]">
            {isEn
              ? "Market data, on-chain, security, news and research tools."
              : "هر ابزار با توضیح فارسی، کاربرد، مزایا، محدودیت‌ها، آموزش استفاده، سایت رسمی و لینک اپلیکیشن معرفی شده است."}
          </p>
          <div className="mt-6 flex max-w-xl items-center gap-3 rounded-2xl border border-cyan-300/15 bg-white/70 px-4 py-3 dark:bg-white/[0.06]">
            <Search className="h-5 w-5 text-cyan-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isEn ? "Search tools..." : "جستجوی ابزار..."}
              className="w-full bg-transparent text-sm font-bold outline-none"
            />
          </div>
        </section>
        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {list.map((tool) => (
            <button
              key={tool.name}
              onClick={() => setActive(tool)}
              className="text-start rounded-[28px] border border-cyan-300/15 bg-white/80 p-5 shadow-xl shadow-cyan-500/5 transition hover:-translate-y-1 hover:border-cyan-300/45 dark:bg-white/[0.055]"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border border-cyan-300/30 bg-cyan-400/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tool.logoUrl}
                    alt=""
                    className="h-8 w-8"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                </div>
                <div>
                  <h2 className="text-lg font-black">{tool.name}</h2>
                  <p className="text-xs font-black text-cyan-500">
                    {isEn ? tool.categoryEn : tool.categoryFa}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">
                {isEn ? tool.summaryEn : tool.summaryFa}
              </p>
            </button>
          ))}
        </section>
      </div>
      {active && (
        <div
          className="fixed inset-0 z-[120] bg-slate-950/72 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setActive(null)}
        >
          <div
            className="mx-auto flex max-h-[88dvh] max-w-3xl flex-col overflow-hidden rounded-[32px] border border-cyan-300/20 bg-slate-950 text-white shadow-[0_32px_120px_rgba(0,0,0,.65)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <h3 className="text-2xl font-black">{active.name}</h3>
                <p className="text-xs font-bold text-cyan-200">
                  {isEn ? active.categoryEn : active.categoryFa}
                </p>
              </div>
              <button
                onClick={() => setActive(null)}
                className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <p className="text-sm font-bold leading-8 text-slate-200">
                {isEn ? active.articleEn : active.articleFa}
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-emerald-400/10 p-4">
                  <h4 className="font-black text-emerald-200">مزایا</h4>
                  <ul className="mt-2 space-y-2 text-sm">
                    {active.prosFa.map((x) => (
                      <li key={x}>• {x}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl bg-amber-400/10 p-4">
                  <h4 className="font-black text-amber-200">محدودیت‌ها</h4>
                  <ul className="mt-2 space-y-2 text-sm">
                    {active.consFa.map((x) => (
                      <li key={x}>• {x}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-5 rounded-2xl bg-white/5 p-4">
                <h4 className="font-black">آموزش سریع استفاده</h4>
                <ul className="mt-2 space-y-2 text-sm">
                  {active.tutorialFa.map((x) => (
                    <li key={x}>• {x}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={active.site}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-black text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                  {isEn ? "Official site" : "سایت رسمی"}
                </a>
                {active.ios ? (
                  <a
                    href={active.ios}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black"
                  >
                    iOS
                  </a>
                ) : null}
                {active.android ? (
                  <a
                    href={active.android}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black"
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
