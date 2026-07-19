import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  ChartNoAxesCombined,
  History,
  NotebookPen,
  ShieldCheck,
  Target,
} from "lucide-react";
import { EnglishShell } from "../../components/EnglishUI";

export const metadata: Metadata = {
  title: "TecPey Trading Arena | Educational trading practice",
  description:
    "Practice risk management, trade planning and post-trade review with virtual capital in TecPey Trading Arena.",
  alternates: { canonical: "https://tecpey.ir/en/academy/trading-arena" },
};

const capabilities = [
  {
    icon: Target,
    title: "Virtual-capital practice",
    description:
      "Test decisions in a learning environment before taking real-market risk.",
  },
  {
    icon: NotebookPen,
    title: "Trading journal",
    description:
      "Record the reason for entry, invalidation conditions and emotional state before each practice trade.",
  },
  {
    icon: BrainCircuit,
    title: "Mentor-connected review",
    description:
      "Authorized Arena evidence can support educational feedback and the next recommended learning step.",
  },
  {
    icon: History,
    title: "Live and replay learning",
    description:
      "The governed product direction includes current-market practice and historical scenario replay.",
  },
];

export default function EnglishTradingArenaPage() {
  return (
    <EnglishShell>
      <main className="px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <section className="relative overflow-hidden rounded-[38px] border border-cyan-300/15 bg-[#04101d] p-6 shadow-[0_35px_120px_rgba(34,211,238,.12)] sm:p-8 lg:p-12">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden="true" />
            <div className="relative grid gap-10 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-black text-cyan-200">
                  <ChartNoAxesCombined className="h-4 w-4" />
                  TecPey Trading Arena
                </div>
                <h1 className="mt-5 max-w-4xl text-balance text-4xl font-black leading-[1.12] text-white sm:text-5xl lg:text-6xl">
                  Learn the decision process before risking real capital
                </h1>
                <p className="mt-5 max-w-3xl text-base font-bold leading-8 text-slate-300 sm:text-lg">
                  Trading Arena is TecPey&apos;s educational practice environment for position sizing, risk controls, trade planning, journaling and evidence-based Mentor feedback. It is not a promise of profit and it does not turn simulated results into financial advice.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href="/en/academy/signup"
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    Create Academy profile
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/en/academy"
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.055] px-5 py-3.5 text-sm font-black text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    Explore the Academy
                  </Link>
                </div>
              </div>

              <div className="rounded-[30px] border border-white/10 bg-white/[0.045] p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-emerald-300" />
                  <div>
                    <h2 className="text-lg font-black text-white">Current availability</h2>
                    <p className="mt-2 text-sm font-bold leading-7 text-slate-300">
                      The authenticated execution workspace is currently completing full English interface parity. This English page explains the product accurately without redirecting you into an unexpected language. Academy registration and learning paths remain available in English.
                    </p>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs font-bold leading-6 text-amber-50">
                  Virtual practice does not eliminate market risk and must not be presented as evidence of guaranteed future performance.
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Trading Arena capabilities">
            {capabilities.map((item) => (
              <article
                key={item.title}
                className="rounded-[26px] border border-slate-200/70 bg-white p-5 shadow-[0_16px_55px_rgba(15,23,42,.06)] dark:border-white/10 dark:bg-white/[0.045]"
              >
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-base font-black text-slate-950 dark:text-white">{item.title}</h2>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{item.description}</p>
              </article>
            ))}
          </section>
        </div>
      </main>
    </EnglishShell>
  );
}
