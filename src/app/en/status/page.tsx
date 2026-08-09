import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, Gauge, LifeBuoy, ShieldCheck } from "lucide-react";
import { TecpeyMark } from "@/components/brand/TecpeyMark";
import { EnglishShell } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Service Status | TecPey",
  description: "Official status and communication paths for TecPey markets, support and security notices.",
  alternates: { canonical: "https://tecpey.ir/en/status" },
};

const serviceRows = [
  {
    icon: Gauge,
    title: "Markets and market board",
    text: "Use the official market page to review price visibility and the next step before entering a trade.",
    href: "/en/markets",
    action: "View markets",
  },
  {
    icon: LifeBuoy,
    title: "Support channels",
    text: "When follow-up is needed, keep the request inside official support paths so it remains traceable.",
    href: "/en/support",
    action: "Open support",
  },
  {
    icon: ShieldCheck,
    title: "Security notices",
    text: "For suspicious links, unknown messages or account-risk signals, the security page is the safest starting point.",
    href: "/en/security",
    action: "Open security",
  },
];

const principles = [
  "Service status must be written in plain language without inflated claims.",
  "Official notices should guide the next action, not just report an event.",
  "For sensitive financial moments, account security and support come before trading.",
];

export default function Page() {
  return (
    <EnglishShell>
      <section className="relative isolate overflow-hidden px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.18),transparent_30%),radial-gradient(circle_at_15%_25%,rgba(37,99,235,.12),transparent_28%)]" />
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.95fr_1.05fr] lg:items-center">
          <aside className="order-2 rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-2xl shadow-cyan-500/10 lg:order-1">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-black text-cyan-200">Public status reference</p>
                <p className="mt-2 text-xs leading-6 text-white/65">Operational updates should be official, clear and actionable.</p>
              </div>
              <TecpeyMark alt="Official TecPey logo" width={54} height={54} priority />
            </div>
            <div className="mt-5 space-y-3">
              {principles.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/6 p-4">
                  <BellRing className="mt-1 h-5 w-5 shrink-0 text-cyan-300" />
                  <p className="text-sm font-bold leading-7 text-white/78">{item}</p>
                </div>
              ))}
            </div>
          </aside>

          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-700 dark:text-cyan-300">
              Status and official notices
            </div>
            <h1 className="mt-6 text-balance text-4xl font-black leading-[1.12] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
              Users need a clear place to check what to do before a financial action.
            </h1>
            <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
              This page points to TecPey markets, support, account security and official communication paths.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/en/markets"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-cyan-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:focus-visible:ring-offset-slate-950"
              >
                View markets
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/en/support"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-6 py-4 text-sm font-black text-slate-900 shadow-sm transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                Contact support
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-3">
          {serviceRows.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="group flex min-h-[260px] flex-col rounded-[28px] border border-slate-200 bg-white/85 p-6 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-xl hover:shadow-cyan-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-white/10 dark:bg-white/5"
            >
              <item.icon className="h-8 w-8 text-cyan-700 dark:text-cyan-300" />
              <h2 className="mt-5 text-xl font-black leading-8 text-slate-950 dark:text-white">{item.title}</h2>
              <p className="mt-3 flex-1 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.text}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-cyan-700 dark:text-cyan-300">
                {item.action}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </EnglishShell>
  );
}
