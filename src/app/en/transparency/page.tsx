import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeInfo, ReceiptText, Scale, ShieldQuestion } from "lucide-react";
import { EnglishShell } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Transparency | TecPey",
  description: "How TecPey explains pricing, fees, risk, rules and support paths before financial action.",
  alternates: { canonical: "https://tecpey.ir/en/transparency" },
};

const tracks = [
  {
    icon: ReceiptText,
    title: "Pricing and fees",
    text: "Users should understand price, fee categories, transfer network and final cost before confirming an order.",
    href: "/en/fees",
    action: "Review fees",
  },
  {
    icon: ShieldQuestion,
    title: "Risk and responsibility",
    text: "Crypto markets are volatile. TecPey explains risk without hype, pressure or profit promises.",
    href: "/en/risk-disclosure",
    action: "Read risk disclosure",
  },
  {
    icon: Scale,
    title: "Rules and limits",
    text: "Account rules, verification, service use and operational limits should be available before a decision.",
    href: "/en/rules",
    action: "Read rules",
  },
];

const checks = [
  "Do I understand the final cost before confirming?",
  "Have I considered volatility and network-transfer risk?",
  "Do I know the official support path for follow-up?",
];

export default function Page() {
  return (
    <EnglishShell>
      <section className="relative isolate overflow-hidden px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.18),transparent_30%),radial-gradient(circle_at_15%_25%,rgba(37,99,235,.12),transparent_28%)]" />
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-700 dark:text-cyan-300">
              Transparency before trading
            </div>
            <h1 className="mt-6 text-balance text-4xl font-black leading-[1.12] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
              Trust starts when cost, risk and rules are visible before the decision.
            </h1>
            <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
              TecPey treats transparency as part of the trading experience: clear information before financial action.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/en/fees"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-cyan-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:focus-visible:ring-offset-slate-950"
              >
                Fees and costs
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/en/risk-disclosure"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-6 py-4 text-sm font-black text-slate-900 shadow-sm transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                Read risk first
              </Link>
            </div>
          </div>

          <aside className="rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-2xl shadow-cyan-500/10">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-white/8">
                <Image src="/logo.png" alt="Official TecPey logo" width={44} height={44} priority />
              </div>
              <div>
                <p className="text-sm font-black text-cyan-200">Before confirmation</p>
                <p className="mt-1 text-xs leading-6 text-white/65">Informed trading begins with the right questions.</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {checks.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/6 p-4">
                  <BadgeInfo className="mt-1 h-5 w-5 shrink-0 text-cyan-300" />
                  <p className="text-sm font-bold leading-7 text-white/78">{item}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-3">
          {tracks.map((item) => (
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
