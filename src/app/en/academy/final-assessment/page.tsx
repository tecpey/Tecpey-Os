import type { Metadata } from "next";
import Link from "next/link";
import { Brain, CalendarCheck2, CheckCircle2, ClipboardCheck, GraduationCap, ShieldCheck, Target, TriangleAlert } from "lucide-react";
import { EnglishShell } from "../../components/EnglishUI";

export const metadata: Metadata = {
  title: "TecPey Academy Final Assessment | Responsible market readiness",
  description: "Final readiness checklist for crypto knowledge, security, research, risk management and trading psychology before responsible market entry.",
  alternates: { canonical: "https://tecpey.ir/en/academy/final-assessment" },
};

const readiness = [
  { title: "Market basics", icon: Brain, checks: ["I can explain Bitcoin, blockchain, coins, tokens and stablecoins with examples.", "I know low unit price does not mean undervaluation.", "I check market cap, volume and liquidity alongside price."] },
  { title: "Asset security", icon: ShieldCheck, checks: ["I never store or send seed phrases or private keys online.", "I use unique passwords, 2FA and official domains.", "I verify network and address before transfers."] },
  { title: "Research and analysis", icon: ClipboardCheck, checks: ["I can create a short project file: team, use case, tokenomics, FDV, vesting and red flags.", "I treat technical analysis as probability, not certainty.", "I define invalidation before taking any market action."] },
  { title: "Risk management", icon: Target, checks: ["I define acceptable loss before thinking about profit.", "I connect position size to stop-loss and total capital.", "I have a stop rule after repeated losses."] },
  { title: "Decision psychology", icon: GraduationCap, checks: ["I recognize FOMO, greed, fear and revenge trading as behavioral risks.", "I pause and journal before emotional decisions.", "I understand the Academy is not a profit promise; it is a responsible learning path."] },
];

const blockers = [
  "I still cannot explain seed phrase security clearly.",
  "I still enter because of pumps, influencers or urgency.",
  "I still confuse price, market cap and FDV.",
  "I still trade without invalidation or risk limits.",
  "I still try to recover losses immediately after a bad decision.",
];

export default function EnglishFinalAssessmentPage() {
  return (
    <EnglishShell>
      <main className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-[38px] border border-cyan-300/15 bg-[#06111f] p-7 shadow-[0_35px_110px_rgba(34,211,238,.12)] lg:p-10">
            <p className="text-sm font-black text-cyan-300">TecPey Academy Final Assessment</p>
            <h1 className="mt-4 text-balance text-4xl font-black leading-[1.15] text-white sm:text-5xl">Are you ready for responsible market entry?</h1>
            <p className="mt-5 max-w-4xl text-base font-bold leading-8 text-slate-300">This is not the end of learning. It is a checkpoint before real action. If any area is unclear, return to the relevant term, use the Practice Lab and ask the AI Mentor.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/en/academy/profile" className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">Open progress dashboard</Link>
              <Link href="/en/academy/specialized-program" className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-400">Apply for specialized program</Link>
              <Link href="/en/academy/ai-guide" className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15">Ask AI Mentor</Link>
            </div>
          </section>

          <section className="mt-8 grid gap-5 lg:grid-cols-5">
            {readiness.map((item) => { const Icon = item.icon; return (
              <article key={item.title} className="rounded-[30px] border border-slate-200 bg-white/90 p-5 shadow-sm">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-500"><Icon className="h-6 w-6" /></div>
                <h2 className="mt-4 text-lg font-black text-slate-950">{item.title}</h2>
                <ul className="mt-4 space-y-3">{item.checks.map((check) => <li key={check} className="flex gap-2 text-sm font-bold leading-7 text-slate-700"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />{check}</li>)}</ul>
              </article>
            ); })}
          </section>

          <section className="mt-8 rounded-[34px] border border-cyan-300/20 bg-cyan-500/10 p-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 text-cyan-100"><CalendarCheck2 className="h-6 w-6" /><h2 className="text-2xl font-black text-white">Next step after the foundation path</h2></div>
                <p className="mt-4 max-w-4xl text-sm font-bold leading-8 text-slate-300">
                  If you completed all seven terms, scenario practice and readiness checks, you can apply for TecPey Academy's specialized online or in-person program. This stage is for deeper education and structured feedback; not signals or profit promises.
                </p>
              </div>
              <Link href="/en/academy/specialized-program" className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">Submit specialized review request</Link>
            </div>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-[34px] border border-amber-300/25 bg-amber-400/10 p-6">
              <div className="flex items-center gap-3 text-amber-100"><TriangleAlert className="h-6 w-6" /><h2 className="text-2xl font-black text-white">If these are true, you are not ready yet</h2></div>
              <ul className="mt-5 space-y-3">{blockers.map((item) => <li key={item} className="text-sm font-bold leading-8 text-slate-300">• {item}</li>)}</ul>
            </div>
            <div className="rounded-[34px] border border-emerald-300/25 bg-emerald-400/10 p-6">
              <h2 className="text-2xl font-black text-white">Desired Academy outcome</h2>
              <p className="mt-4 text-sm font-bold leading-8 text-slate-300">A graduate should not feel like a market expert. They should feel no longer defenseless: able to ask better questions, protect assets, manage risk and avoid emotional decisions.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/en/academy/practice-lab" className="inline-flex rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-400">Practice scenarios</Link>
                <Link href="/en/markets" className="inline-flex rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-5 py-3 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/15">View markets responsibly</Link>
                <Link href="/en/academy/specialized-program" className="inline-flex rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15">Join specialized review list</Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </EnglishShell>
  );
}
