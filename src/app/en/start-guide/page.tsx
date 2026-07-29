import { StructuredData } from "@/components/seo/StructuredData";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, CheckCircle2, ShieldCheck, TrendingUp, WalletCards } from "lucide-react";
import { EnglishShell, EnglishHero } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Start guide | TecPey",
  description: "A practical path to start with crypto through education, account security, live markets, decision practice and risk management.",
  alternates: { canonical: "https://tecpey.ir/en/start-guide" },
};

const steps = [
  { icon: BookOpenCheck, title: "1. Learn the basics", text: "Start with Bitcoin, USDT, wallets, transfer networks and fees. If a term is unclear, ask the AI Mentor before trading.", href: "/en/academy" },
  { icon: ShieldCheck, title: "2. Secure your account", text: "Use strong passwords, 2FA, the official domain, anti-phishing habits and careful address checks before moving funds.", href: "/en/security" },
  { icon: TrendingUp, title: "3. Watch live markets", text: "Review prices, changes, liquidity and relevant news together. Do not enter a trade just because a price moved up.", href: "/en/markets" },
  { icon: WalletCards, title: "4. Practice before real money", text: "Use the simulator to practice buy, sell or wait scenarios, then decide with a risk-management checklist.", href: "/en/academy/simulator" },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "How should I start crypto safely?", acceptedAnswer: { "@type": "Answer", text: "Learn the basics, secure your account, understand fees and networks, review markets and practice before real trading." } },
    { "@type": "Question", name: "Should I trade without learning first?", acceptedAnswer: { "@type": "Answer", text: "No. TecPey recommends using the academy, safety checklist and simulator before real trading decisions." } },
  ],
};

export default function Page() {
  return (
    <EnglishShell>
      <StructuredData data={faqSchema} />
      <EnglishHero eyebrow="TecPey Start" title="Start your crypto journey with clarity" description="A practical path for users who want to enter crypto with knowledge, security and risk management instead of emotion." ctaHref="/en/academy" ctaLabel="Start learning" secondaryHref="/en/markets" secondaryLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.16),transparent_34%),linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-2xl shadow-cyan-500/10 md:p-8">
          <h2 className="text-2xl font-black">Safe path summary</h2>
          <p className="mt-4 max-w-4xl text-sm font-bold leading-7 text-white/72">Learn first, build security habits, watch the market and practice decisions before using real money. This guide is designed for a quick but responsible start.</p>
        </div>
        <div className="mx-auto mt-8 grid max-w-7xl gap-4 md:grid-cols-2">
          {steps.map((item) => (
            <Link key={item.title} href={item.href} className="group rounded-[30px] border border-cyan-300/15 bg-[#06111f] p-6 text-white shadow-[0_20px_70px_rgba(0,0,0,.18)] transition hover:-translate-y-1">
              <item.icon className="h-8 w-8 text-cyan-300" />
              <h3 className="mt-4 text-xl font-black leading-8">{item.title}</h3>
              <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{item.text}</p>
              <div className="mt-5 inline-flex items-center gap-2 text-sm font-black text-cyan-300">Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></div>
            </Link>
          ))}
        </div>
        <div className="mx-auto mt-8 max-w-7xl rounded-[30px] border border-emerald-300/25 bg-emerald-300/10 p-6 text-emerald-100">
          <h2 className="text-xl font-black">Before your first trade, ask yourself three questions</h2>
          <ul className="mt-4 space-y-3 text-sm font-bold leading-7">
            <li className="flex gap-2"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0" />Do I understand the asset, network and fee?</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0" />Do I have a risk plan if price moves against me?</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0" />Am I using the official domain and a secure account?</li>
          </ul>
        </div>
      </section>
    </EnglishShell>
  );
}
