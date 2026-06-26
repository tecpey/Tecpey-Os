import type { Metadata } from "next";
import Link from "next/link";
import { Bot, CheckCircle2, ShieldAlert, Sparkles } from "lucide-react";
import { EnglishShell } from "../../components/EnglishUI";

export const metadata: Metadata = {
  title: "TecPey AI Mentor | Academy learning assistant",
  description: "TecPey AI Mentor helps users understand crypto concepts, security, risk management and responsible learning without giving financial signals.",
  alternates: { canonical: "https://tecpey.ir/en/academy/ai-guide" },
};

const rules = [
  "It explains concepts, examples, mistakes and checklists; it does not give buy or sell signals.",
  "It must never ask for seed phrases, private keys, passwords, 2FA codes or API keys.",
  "It links users back to the relevant TecPey Academy terms before market decisions.",
  "It treats risk management and security as mandatory learning steps, not optional details.",
];

const prompts = [
  "Explain RSI like I am a beginner and show one common mistake.",
  "How should I think about risk before buying Bitcoin?",
  "What should I check before transferring USDT?",
  "How can I detect a suspicious crypto project?",
];

export default function EnglishAiGuidePage() {
  return (
    <EnglishShell>
      <main className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-[38px] border border-cyan-300/15 bg-[#06111f] p-7 shadow-[0_35px_110px_rgba(34,211,238,.12)] lg:p-10">
            <p className="text-sm font-black text-cyan-300">TecPey AI Mentor</p>
            <h1 className="mt-4 text-balance text-4xl font-black leading-[1.15] text-white sm:text-5xl">A safe learning assistant, not a signal bot</h1>
            <p className="mt-5 max-w-4xl text-base font-bold leading-8 text-slate-300">
              The mentor is designed to support Academy learning: explain concepts, connect questions to lessons, highlight risk and suggest the next study step. It must not promise profit, predict prices or request sensitive credentials.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/en/academy/practice-lab" className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">Open Practice Lab</Link>
              <Link href="/en/academy/final-assessment" className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15">Final assessment</Link>
            </div>
          </section>

          <section id="mentor-chat" className="mt-8 rounded-[34px] border border-cyan-300/20 bg-cyan-500/10 p-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
              <div>
                <p className="text-xs font-black text-cyan-300">Start here</p>
                <h2 className="mt-3 text-2xl font-black text-white">Ask the mentor before you make a market decision</h2>
                <p className="mt-3 text-sm font-bold leading-7 text-slate-300">Use the mentor for concepts, security, risk and learning guidance. It is not a signal bot and does not replace personal research.</p>
              </div>
              <Link href="/academy/ai-guide#mentor-chat" className="rounded-2xl bg-cyan-500 px-5 py-4 text-center text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:bg-cyan-400">Open Persian live mentor</Link>
            </div>
          </section>

          <section className="mt-8 grid gap-5 lg:grid-cols-3">
            <div className="rounded-[30px] border border-cyan-300/15 bg-white/90 p-6 shadow-sm">
              <Bot className="h-8 w-8 text-cyan-500" />
              <h2 className="mt-4 text-2xl font-black text-slate-950">Personal learning coach</h2>
              <p className="mt-3 text-sm font-bold leading-7 text-slate-700">The mentor should adapt answers to the user’s term, confidence and weak topics when server-side memory is enabled.</p>
            </div>
            <div className="rounded-[30px] border border-emerald-300/15 bg-white/90 p-6 shadow-sm">
              <Sparkles className="h-8 w-8 text-emerald-500" />
              <h2 className="mt-4 text-2xl font-black text-slate-950">Lesson-first answers</h2>
              <p className="mt-3 text-sm font-bold leading-7 text-slate-700">Every answer should point back to a TecPey lesson, checklist or practice scenario so the user stays inside the learning path.</p>
            </div>
            <div className="rounded-[30px] border border-rose-300/15 bg-white/90 p-6 shadow-sm">
              <ShieldAlert className="h-8 w-8 text-rose-500" />
              <h2 className="mt-4 text-2xl font-black text-slate-950">Safety guardrails</h2>
              <p className="mt-3 text-sm font-bold leading-7 text-slate-700">The mentor blocks unsafe requests and redirects financial questions toward risk, security and education.</p>
            </div>
          </section>

          <section className="mt-8 rounded-[34px] border border-cyan-300/20 bg-cyan-500/10 p-6">
            <h2 className="text-2xl font-black text-white">Recommended starter questions</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {prompts.map((item) => <div key={item} className="rounded-2xl bg-white/10 p-4 text-sm font-black leading-7 text-cyan-50">{item}</div>)}
            </div>
          </section>

          <section className="mt-8 rounded-[34px] border border-amber-300/20 bg-amber-500/10 p-6">
            <h2 className="text-2xl font-black text-white">Non-negotiable mentor rules</h2>
            <div className="mt-5 grid gap-3">
              {rules.map((item) => <div key={item} className="flex gap-3 rounded-2xl bg-white/10 p-4 text-sm font-bold leading-7 text-amber-50"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-amber-300" />{item}</div>)}
            </div>
          </section>
        </div>
      </main>
    </EnglishShell>
  );
}
