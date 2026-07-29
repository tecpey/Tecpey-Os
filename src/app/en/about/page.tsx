import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../components/EnglishUI";
import { ShieldCheck, GraduationCap, TrendingUp, Users, Globe2, Building2, Heart, Target } from "lucide-react";

export const metadata: Metadata = {
  title: "About TecPey | Persian crypto exchange",
  description: "TecPey is more than a market access platform; its mission is to create a safer entry point into crypto markets through education, evaluation and professional onboarding.",
  alternates: { canonical: "https://tecpey.ir/en/about" },
};

const stats = [
  { value: "7", label: "Academy terms", hint: "From basics to trading psychology" },
  { value: "50+", label: "Crypto dossiers", hint: "Market data and risk context" },
  { value: "20+", label: "Trader tools", hint: "Analysis, risk, on-chain and macro" },
  { value: "1", label: "Safe path", hint: "Learn → Analyze → Practice → Decide" },
];

const pillars = [
  { icon: ShieldCheck, title: "Security-first", text: "Account security, anti-phishing education, 2FA habits and safe transfer practices are built into the TecPey experience before users ever see a trading button." },
  { icon: GraduationCap, title: "Education before trading", text: "TecPey Academy is free and structured — 7 terms from crypto basics to market psychology. The goal is informed entry, not rushed decisions." },
  { icon: TrendingUp, title: "Transparent markets", text: "Live prices, fee structures and market board are visible to every user — before and after registration. No hidden costs, no surprises." },
  { icon: Heart, title: "Respect for users", text: "TecPey does not promise profit. TecPey does not push users into rushed trading. The platform is designed to earn trust before the first trade." },
];

export default function Page() {
  return (
    <EnglishShell>
      {/* Hero */}
      <section className="relative overflow-hidden px-4 py-14 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.18),transparent_34%),radial-gradient(circle_at_20%_80%,rgba(30,64,175,.10),transparent_32%)]" />
        <div className="relative mx-auto max-w-7xl">
          <div className="tp-label mb-6">
            <Building2 className="h-3.5 w-3.5" />
            About TecPey
          </div>
          <h1 className="max-w-4xl text-balance text-4xl font-black leading-[1.15] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
            TecPey — Your Safe Entry Point to the Crypto Market
          </h1>
          <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
            TecPey is a Persian crypto trading platform and education ecosystem. It was built with one belief: entering digital financial markets should be more informed, safer and more responsible.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/en/markets" className="group inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400">
              View markets
            </Link>
            <Link href="/en/academy" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/[0.06] dark:text-white">
              Free Academy
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className="tp-card p-5 text-center">
              <p className="text-3xl font-black text-cyan-500">{item.value}</p>
              <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">{item.label}</p>
              <p className="mt-1 text-xs font-bold leading-6 text-slate-500 dark:text-slate-400">{item.hint}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mission */}
      <section className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/15 bg-slate-950 p-8 text-white shadow-2xl shadow-cyan-500/10 lg:p-12">
          <div className="grid gap-8 lg:grid-cols-[.85fr_1.15fr] lg:items-start">
            <div>
              <div className="tp-label mb-4 text-cyan-200 dark:text-cyan-200">
                <Target className="h-3.5 w-3.5" />
                Our mission
              </div>
              <h2 className="text-3xl font-black leading-tight sm:text-4xl">
                So crypto entry does not begin with hype, fear or random advice
              </h2>
              <p className="mt-4 text-sm font-bold leading-8 text-slate-300">
                Many people enter crypto markets without education, without understanding risk — only based on scattered advice. TecPey was built to change that.
              </p>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-300">
                TecPey brings learning, security education, market tools and a live trading platform together — so users can make decisions with better preparation.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {pillars.map((item) => (
                <div key={item.title} className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5 transition hover:-translate-y-1 hover:border-cyan-300/30 hover:bg-white/[0.09]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-black">{item.title}</h3>
                  <p className="mt-2 text-xs font-bold leading-6 text-slate-300">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Company info */}
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
          <div className="tp-card p-8">
            <div className="tp-label mb-4">
              <Globe2 className="h-3.5 w-3.5" />
              Legal entity
            </div>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">TechnoPardakht</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">
              TecPey is operated by TechnoPardakht, based in Babol, Mazandaran province, Iran. The company has a physical office, publicly listed contact details and a transparent fee structure.
            </p>
            <div className="mt-4 space-y-2 text-sm font-bold text-slate-600 dark:text-slate-400">
              <p>📍 Babol, Mazandaran, Iran</p>
              <p>📞 +98 11 3233 8026</p>
              <p>✉️ info@tecpey.ir</p>
            </div>
            <Link href="/en/contact-us" className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-600 transition hover:bg-cyan-300/20 dark:text-cyan-300">
              Contact TecPey
            </Link>
          </div>
          <div className="tp-card p-8">
            <div className="tp-label mb-4">
              <Users className="h-3.5 w-3.5" />
              Who TecPey is for
            </div>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">Persian-speaking users entering crypto safely</h2>
            <div className="mt-4 space-y-3">
              {[
                ["Primary audience", "Persian-speaking users in Iran who are new to crypto or early in their learning journey."],
                ["Secondary audience", "Iranian diaspora and Persian-speaking communities outside Iran."],
                ["Not for", "High-frequency traders, institutional investors, or users seeking leveraged derivatives."],
              ].map(([label, text]) => (
                <div key={label} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.04] p-4">
                  <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">{label}</p>
                  <p className="mt-1 text-sm font-bold text-slate-600 dark:text-slate-300">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </EnglishShell>
  );
}
