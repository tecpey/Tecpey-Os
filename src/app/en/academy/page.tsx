import Link from "next/link";
import { ArticleSchema } from "@/components/seo/ArticleSchema";
import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";
import { ClipboardCheck, CheckCircle2 } from "lucide-react";
import { TermGateLink } from "@/components/academy/TermGateLink";
import { AcademyEngagementHub } from "@/components/academy/AcademyEngagementHub";

export const metadata: Metadata = {
  title: "TecPey Academy | Safe crypto learning path",
  description: "TecPey — Your Safe Entry Point to the Crypto Market. A structured learning path for safer crypto understanding, security, risk management and responsible market entry.",
  alternates: { canonical: "https://tecpey.ir/en/academy" },
};


const academyTerms = [
  { term: "Term 1", title: "Blockchain and crypto basics", lessons: ["What is blockchain?", "What is Bitcoin?", "What is USDT?", "What is a wallet?"], exam: "Exam 1" },
  { term: "Term 2", title: "Account security and asset protection", lessons: ["Strong passwords", "2FA", "Phishing", "Common security mistakes"], exam: "Exam 2" },
  { term: "Term 3", title: "Exchange use and spot trading", lessons: ["Registration", "Verification", "Buy and sell", "Deposits and withdrawals"], exam: "Exam 3" },
  { term: "Term 4", title: "Project research basics", lessons: ["Market cap", "FDV", "Tokenomics", "Red flags"], exam: "Exam 4" },
  { term: "Term 5", title: "Beginner technical analysis", lessons: ["Candles", "Trends", "Support and resistance", "Volume"], exam: "Exam 5" },
  { term: "Term 6", title: "Capital management and psychology", lessons: ["Stop-loss", "Risk management", "FOMO", "Trading journal"], exam: "Exam 6" },
  { term: "Term 7", title: "Market psychology and readiness", lessons: ["Fear and greed", "FOMO", "Revenge trading", "Final readiness checklist"], exam: "Final exam" },
];

const articles = [
  { slug: "what-is-bitcoin", title: "What is Bitcoin?", text: "A plain-English guide to Bitcoin, its role in crypto markets, key risks and what users should understand before buying BTC." },
  { slug: "what-is-usdt", title: "What is USDT?", text: "Learn how Tether works, why users use stablecoins and what risks to check before transferring or buying USDT." },
  { slug: "how-to-buy-usdt-in-iran", title: "How to buy USDT in Iran", text: "A practical guide for users who want to understand Tether, fees, networks and security before buying USDT." },
  { slug: "crypto-exchange-security", title: "Crypto exchange security basics", text: "How to protect your account, avoid phishing and build safer crypto habits before trading." },
  { slug: "technical-analysis-basics", title: "Technical analysis basics", text: "A beginner-friendly explanation of charts, trends, support, resistance and risk management." },
  { slug: "crypto-fees-explained", title: "Crypto Fees Explained", text: "A TecPey English guide for learning crypto concepts, risks and safer trading decisions." },
  { slug: "what-is-blockchain", title: "What Is Blockchain", text: "A TecPey English guide for learning crypto concepts, risks and safer trading decisions." },
  { slug: "wallet-vs-exchange", title: "Wallet Vs Exchange", text: "A TecPey English guide for learning crypto concepts, risks and safer trading decisions." },
  { slug: "risk-management-in-crypto", title: "Risk management in crypto", text: "Why risk management matters and how users can avoid emotional decisions in volatile markets." },
  { slug: "how-to-choose-crypto-exchange", title: "How To Choose Crypto Exchange", text: "A TecPey English guide for learning crypto concepts, risks and safer trading decisions." },
  { slug: "crypto-scam-and-phishing", title: "Crypto Scam And Phishing", text: "A TecPey English guide for learning crypto concepts, risks and safer trading decisions." },
  { slug: "live-crypto-price-guide", title: "Live Crypto Price Guide", text: "A TecPey English guide for learning crypto concepts, risks and safer trading decisions." }
];

export default function AcademyPage() {
  return (
    <EnglishShell>
      <ArticleSchema headline="TecPey Academy" description="Clear cryptocurrency education about Bitcoin, USDT, account security, fees and safer onboarding." url="https://tecpey.ir/en/academy" language="en" />
      <EnglishHero eyebrow="Academy" title="Free crypto education for every TecPey user" description="TecPey Academy is a structured free learning path: crypto basics, security, exchange use, project research, technical analysis, risk management and market psychology. The goal is safer, more informed market entry — not profit promises." ctaHref="/en/academy/term-1" ctaLabel="Start free education" />
      
      <AcademyEngagementHub locale="en" />
      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-emerald-300/20 bg-emerald-500/10 p-6 shadow-[0_24px_80px_rgba(16,185,129,.10)]">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
            <div>
              <p className="text-xs font-black text-emerald-300">TecPey Verified Certificate</p>
              <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">Every completed term can become a verifiable certificate</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-300">After completing a term and passing its assessment, your certificate is issued with a unique ID, scannable QR and public verification page — ready to print, share and use in your learning resume.</p>
            </div>
            <div className="grid gap-3">
              <Link href="/en/academy/certificates" className="rounded-2xl bg-emerald-500 px-5 py-4 text-center text-sm font-black text-white transition hover:bg-emerald-400">View verified certificates</Link>
              <Link href="/en/academy/hall-of-fame" className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-5 py-4 text-center text-sm font-black text-amber-100 transition hover:bg-amber-300/15">Academy Hall of Fame</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/25 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.20),transparent_34%),linear-gradient(145deg,#07111f,#0f172a)] p-6 shadow-[0_24px_80px_rgba(34,211,238,.12)]">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
            <div>
              <p className="text-xs font-black text-cyan-300">TecPey AI Mentor</p>
              <h2 className="mt-3 text-2xl font-black text-white">When something is unclear, ask the mentor before you decide</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-300">The mentor is built for learning, safety and risk questions, not buy or sell signals. Answers connect you back to Academy lessons and the next learning step.</p>
            </div>
            <div className="grid gap-3">
              <Link href="/en/academy/ai-guide" className="rounded-2xl bg-cyan-500 px-5 py-4 text-center text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400">Chat with AI Mentor</Link>
              <Link href="/en/academy/profile" className="rounded-2xl border border-cyan-300/25 bg-white/5 px-5 py-4 text-center text-sm font-black text-cyan-100 transition hover:bg-white/10">View learning progress</Link>
            </div>
          </div>
        </div>
      </section>
      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/20 bg-cyan-500/10 p-6 shadow-[0_24px_80px_rgba(34,211,238,.12)]">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-white">Personalized Academy Coach</h2>
              <p className="mt-3 text-sm font-bold leading-8 text-slate-300">Your coach connects term progress, recent questions and learning gaps into a clear next step, so the mentor does more than answer isolated questions.</p>
            </div>
            <Link href="/en/academy/mentor-coach" className="rounded-2xl bg-cyan-500 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-cyan-400">Open personal coach</Link>
          </div>
        </div>
      </section>

      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-black text-slate-950">TecPey Academy 7-term path</h2>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-600">
              TecPey Academy starts from basic concepts, then moves through security, exchange use, analysis, risk management and professional readiness. Each term ends with a short exam.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
            {academyTerms.map((item, index) => (
              <article key={item.term} className="rounded-[28px] border border-cyan-200 bg-white/92 p-5 shadow-[0_18px_55px_rgba(15,23,42,.10)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-600">{item.term}</span>
                  <ClipboardCheck className="h-6 w-6 text-cyan-600" />
                </div>
                <h3 className="mt-4 text-lg font-black leading-8 text-slate-950">{item.title}</h3>
                <ul className="mt-3 space-y-2">
                  {item.lessons.map((lesson) => (
                    <li key={lesson} className="flex gap-2 text-sm font-bold leading-7 text-slate-600">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-600" />
                      <span>{lesson}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-xs font-black text-cyan-700">{item.exam}</p>
                <TermGateLink href={`/en/academy/term-${index + 1}`} termNumber={index + 1} className="mt-3 block rounded-2xl bg-cyan-500 px-3 py-2 text-center text-xs font-black text-white transition hover:bg-cyan-400" lockedClassName="bg-slate-600 hover:bg-slate-600" locale="en">Start lesson and quiz</TermGateLink>
              </article>
            ))}
          </div>
        </div>
      </section>


      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-black text-slate-950">TecPey Practice Labs</h2>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-600">
              Academy is not only reading. Practice labs help train market decisions, crash scenarios, portfolio thinking, psychology and risk without using real money.
            </p>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-5">
            {[
              ["Market decision", "/en/academy/simulator"],
              ["Crash simulator", "/en/academy/crash-simulator"],
              ["Portfolio lab", "/en/academy/portfolio-lab"],
              ["Psychology lab", "/en/academy/psychology-lab"],
              ["Risk simulator", "/en/academy/risk-simulator"],
            ].map(([title, href]) => (
              <a key={href} href={href} className="rounded-[24px] border border-emerald-200 bg-white p-4 text-center transition hover:-translate-y-1 hover:bg-emerald-100">
                <p className="text-sm font-black text-slate-950">{title}</p>
                <span className="mt-3 inline-flex rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white">Start practice</span>
              </a>
            ))}
          </div>
        </div>
      </section>
      <section className="px-4 pb-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          <a href="/en/academy/practice-lab" className="rounded-[28px] border border-emerald-200 bg-white/92 p-5 text-center shadow-sm transition hover:-translate-y-1 hover:bg-emerald-50"><h3 className="text-lg font-black text-slate-950">Practice Lab</h3><p className="mt-3 text-sm font-bold leading-7 text-slate-600">Scenario-based market decisions with feedback and related lessons.</p></a>
          <a href="/en/academy/ai-guide" className="rounded-[28px] border border-violet-200 bg-white/92 p-5 text-center shadow-sm transition hover:-translate-y-1 hover:bg-violet-50"><h3 className="text-lg font-black text-slate-950">AI Mentor</h3><p className="mt-3 text-sm font-bold leading-7 text-slate-600">A safe learning assistant for concepts, risk and security questions.</p></a>
          <a href="/en/academy/final-assessment" className="rounded-[28px] border border-cyan-200 bg-white/92 p-5 text-center shadow-sm transition hover:-translate-y-1 hover:bg-cyan-50"><h3 className="text-lg font-black text-slate-950">Final Assessment</h3><p className="mt-3 text-sm font-bold leading-7 text-slate-600">Check readiness across knowledge, security, research, risk and psychology.</p></a>
        </div>
      </section>
      <section className="px-4 pb-6 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {[
            ["Free education for everyone", "The full learning path is available to users without course fees."],
            ["Structured exams and scoring", "Each level ends with practical assessments that measure readiness."],
            ["Responsible market readiness", "The academy path helps users review knowledge, security, risk and behavior before they enter the market."],
          ].map(([title, text]) => (
            <EnglishCard key={title} title={title} text={text} href={undefined} />
          ))}
        </div>
      </section>
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((item) => <EnglishCard key={item.slug} title={item.title} text={item.text} href={`/en/academy/${item.slug}`} />)}
        </div>
      </section>
    
      <section id="academy-quiz" className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[30px] border border-cyan-200 bg-white/92 p-6 text-center shadow-[0_18px_55px_rgba(15,23,42,.10)]">
          <h2 className="text-2xl font-black text-slate-950">End-of-term quizzes</h2>
          <p className="mt-3 text-sm font-bold leading-8 text-slate-600">
            Term quizzes help users verify understanding before moving forward. The goal is not memorization; it is turning knowledge into safer behavior.
          </p>
          <a href="/en/academy/signup" className="mt-5 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">Sign up and start learning</a>
        </div>
      </section>

    <section className="px-4 pb-10 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl rounded-[30px] border border-cyan-300/20 bg-cyan-500/10 p-6 text-center"><h2 className="text-2xl font-black text-slate-950 dark:text-white">Academy student dashboard</h2><p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">Track XP, levels, badges and your 7-term progress in one place.</p><a href="/en/academy/profile" className="mt-5 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">Open dashboard</a></div></section></EnglishShell>
  );
}
