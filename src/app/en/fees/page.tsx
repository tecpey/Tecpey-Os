import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../components/EnglishUI";
import { DollarSign, Network, Percent, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Fees and commissions | TecPey",
  description: "Understand trading fees, deposit and withdrawal considerations, network fees and transparent fee communication at TecPey.",
  alternates: { canonical: "https://tecpey.ir/en/fees" },
};

const feeCategories = [
  {
    icon: Percent,
    title: "Trading fees",
    description: "Applied when you buy or sell crypto on TecPey markets.",
    rows: [
      { label: "Maker fee", value: "Competitive rate", note: "Applies when adding liquidity" },
      { label: "Taker fee", value: "Competitive rate", note: "Applies when taking liquidity" },
      { label: "Fee transparency", value: "Always shown", note: "Before order confirmation" },
    ],
  },
  {
    icon: Network,
    title: "Network (blockchain) fees",
    description: "Paid to the blockchain network when withdrawing or transferring crypto.",
    rows: [
      { label: "Bitcoin (BTC)", value: "Variable", note: "Depends on network congestion" },
      { label: "Ethereum (ETH)", value: "Variable", note: "Gas fee — check before transfer" },
      { label: "USDT (TRC20)", value: "Lower", note: "Tron network is typically cheaper" },
    ],
  },
  {
    icon: DollarSign,
    title: "Fiat deposit / withdrawal",
    description: "Costs associated with depositing or withdrawing Iranian rials (IRR) or other fiat currencies.",
    rows: [
      { label: "IRR deposit", value: "Varies", note: "Depends on payment method" },
      { label: "IRR withdrawal", value: "Varies", note: "Depends on bank and amount" },
      { label: "Processing time", value: "1–3 business days", note: "Subject to banking hours" },
    ],
  },
];

const principles = [
  "All fees are shown before you confirm any action",
  "No fee changes are applied retroactively",
  "Network fees are set by blockchain networks, not TecPey",
  "You can always check fees on the order preview screen",
];

export default function Page() {
  return (
    <EnglishShell>
      {/* Hero */}
      <section className="relative overflow-hidden px-4 py-14 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.18),transparent_34%)]" />
        <div className="relative mx-auto max-w-7xl text-left">
          <div className="tp-label mb-6">
            <Percent className="h-3.5 w-3.5" />
            Fees
          </div>
          <h1 className="max-w-4xl text-balance text-4xl font-black leading-[1.15] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
            Clear fees before you trade
          </h1>
          <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
            TecPey is committed to fee transparency. Every cost — trading, network or withdrawal — is visible before you confirm any action.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/en/markets" className="group inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400">
              View markets <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </Link>
            <Link href="/en/faq" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/[0.06] dark:text-white">
              Fee FAQ
            </Link>
          </div>
        </div>
      </section>

      {/* Fee tables */}
      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-3">
          {feeCategories.map((cat) => (
            <div key={cat.title} className="tp-card p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-500">
                <cat.icon className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-xl font-black text-slate-950 dark:text-white">{cat.title}</h2>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{cat.description}</p>
              <div className="mt-4 divide-y divide-slate-200/60 dark:divide-white/[0.08]">
                {cat.rows.map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-black text-slate-950 dark:text-white">{row.label}</p>
                      <p className="text-xs font-bold text-slate-400">{row.note}</p>
                    </div>
                    <span className="shrink-0 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-xs font-black text-cyan-600 dark:text-cyan-300">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Principles */}
      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="tp-label mb-5">Fee transparency principles</div>
          <div className="grid gap-3 md:grid-cols-2">
            {principles.map((p) => (
              <div key={p} className="flex items-start gap-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.04] p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Network fee note */}
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[28px] border border-amber-300/25 bg-amber-50 p-6 dark:border-amber-300/15 dark:bg-amber-300/[0.06]">
          <div className="flex items-start gap-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <h3 className="text-base font-black text-amber-800 dark:text-amber-200">Important: network fee warnings</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-amber-700 dark:text-amber-300">
                Always verify the network when withdrawing crypto. Sending USDT on the wrong network (e.g., ERC20 instead of TRC20) may result in permanent loss. TecPey always shows the selected network clearly before transfer confirmation.
              </p>
            </div>
          </div>
        </div>
      </section>
    </EnglishShell>
  );
}
