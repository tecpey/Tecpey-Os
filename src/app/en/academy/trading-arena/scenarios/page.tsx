import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, DatabaseZap, ShieldCheck, Workflow } from "lucide-react";
import { EnglishShell } from "../../../components/EnglishUI";

export const metadata: Metadata = {
  title: "Trading Scenarios | TecPey Academy",
  description:
    "TecPey training scenarios are moving to the server-authoritative, auditable Arena execution engine.",
  alternates: { canonical: "https://tecpey.ir/en/academy/trading-arena/scenarios" },
};

export default function EnglishScenariosPage() {
  return (
    <EnglishShell>
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-6 lg:px-8" dir="ltr">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[32px] border border-cyan-300/15 bg-slate-900/75 p-7 shadow-2xl shadow-black/20 sm:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10">
              <Workflow className="h-7 w-7 text-cyan-300" />
            </div>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Secure migration in progress</p>
            <h1 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">Training scenarios are moving to the authoritative Arena engine</h1>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-400">
              The legacy scenario flow kept trade state and progress in the browser. To preserve one source of truth, it remains unavailable until scenarios return with command identities, revisions, event evidence and cross-device history.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                <p className="mt-3 text-sm font-black">No parallel execution</p>
                <p className="mt-1 text-xs font-bold leading-6 text-slate-500">Browser memory never becomes the Arena account authority.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <DatabaseZap className="h-5 w-5 text-violet-300" />
                <p className="mt-3 text-sm font-black">Server-side progress</p>
                <p className="mt-1 text-xs font-bold leading-6 text-slate-500">Scenario outcomes must be recoverable across devices and admissible as Mentor evidence.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <Workflow className="h-5 w-5 text-cyan-300" />
                <p className="mt-3 text-sm font-black">Traceable commands</p>
                <p className="mt-1 text-xs font-bold leading-6 text-slate-500">Every decision will execute with idempotency, revision control and event evidence.</p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs font-bold leading-6 text-amber-200">
              The primary Arena account and server journal remain active. Only the legacy scenario engine is unavailable while the governed replacement is completed.
            </div>

            <Link
              href="/en/academy/trading-arena"
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              Return to the secure Arena
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </main>
    </EnglishShell>
  );
}
