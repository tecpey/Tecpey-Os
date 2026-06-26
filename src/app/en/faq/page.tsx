import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../components/EnglishUI";
import { StructuredData, breadcrumbSchema } from "@/components/seo/StructuredData";
import { HelpCircle, ShieldCheck, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "TecPey FAQ | Bitcoin, USDT, security and fees",
  description: "Clear answers to common TecPey questions about registration, crypto security, Bitcoin, Tether, fees, transfers and starting safely.",
  alternates: { canonical: "https://tecpey.ir/en/faq" },
};

const faqs = [
  {
    category: "Getting started",
    items: [
      { q: "How do I start on TecPey?", a: "Create an account, review the start guide, understand basic risks and check market prices before trading. TecPey Academy is free and recommended before your first transaction." },
      { q: "Is TecPey Academy free?", a: "Yes. The full academy path — from crypto basics to trading psychology — is completely free. No subscription, no paywall. Advanced official programs are a separate track." },
      { q: "Is TecPey suitable for complete beginners?", a: "Yes. TecPey Academy is designed for users who have never touched crypto. It starts from blockchain basics, wallet safety and account security before any trading concepts." },
    ],
  },
  {
    category: "Safety and trust",
    items: [
      { q: "Does TecPey promise profit?", a: "No. Crypto markets are volatile. TecPey provides education, market access and information — not profit guarantees. Cryptocurrency involves significant risk." },
      { q: "Why does security matter so much?", a: "Strong passwords, verification codes, safe devices and anti-phishing awareness reduce account and transfer risk. TecPey teaches these as the first step before any trading." },
      { q: "Is TecPey AI Mentor a financial advisor?", a: "No. The AI Mentor is an educational tool. It answers learning, security and risk questions — not buy or sell signals. It always connects back to Academy lessons." },
    ],
  },
  {
    category: "Fees and transfers",
    items: [
      { q: "What should I check before a transfer?", a: "Always review: the destination address, selected network, amount, fees and final recipient before confirming. Wrong network selections can result in permanent loss." },
      { q: "How are fees explained?", a: "TecPey shows trading fees, withdrawal costs and network fees transparently before any action. Review the fees page for current rates." },
      { q: "Are there hidden costs?", a: "No. TecPey is committed to transparency. All fees — trading, withdrawal and network — are visible before you take action." },
    ],
  },
  {
    category: "Support",
    items: [
      { q: "How can I contact TecPey?", a: "Use only official TecPey contact channels: support@tecpey.ir, +98 11 3233 8026, or official Telegram @tecpeyco. Avoid links or messages from unknown sources." },
      { q: "What if I suspect suspicious activity?", a: "Change your password immediately, review active sessions, sign out of unknown devices, and contact TecPey through official channels. Do not click suspicious links." },
    ],
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.flatMap((cat) =>
    cat.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    }))
  ),
};

export default function Page() {
  return (
    <EnglishShell>
      <StructuredData data={[faqSchema, breadcrumbSchema([{ name: "Home", url: "https://tecpey.ir/en" }, { name: "FAQ", url: "https://tecpey.ir/en/faq" }])]} />

      {/* Hero */}
      <section className="relative overflow-hidden px-4 py-14 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.18),transparent_34%)]" />
        <div className="relative mx-auto max-w-7xl text-left">
          <div className="tp-label mb-6">
            <HelpCircle className="h-3.5 w-3.5" />
            FAQ
          </div>
          <h1 className="max-w-4xl text-balance text-4xl font-black leading-[1.15] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
            Clear answers before you start
          </h1>
          <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300">
            Short, practical answers about registration, Bitcoin, USDT, fees, account security, transfers and support.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/en/start-guide" className="group inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400">
              Start guide <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </Link>
            <Link href="/en/security" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/[0.06] dark:text-white">
              Security center <ShieldCheck className="h-5 w-5 text-cyan-500" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ by category */}
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-10">
          {faqs.map((cat) => (
            <div key={cat.category}>
              <div className="tp-label mb-4">{cat.category}</div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {cat.items.map((item) => (
                  <div key={item.q} className="tp-card p-6">
                    <h3 className="text-base font-black text-slate-950 dark:text-white">{item.q}</h3>
                    <p className="mt-3 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Risk disclaimer */}
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[28px] border border-amber-300/25 bg-amber-50 p-6 dark:border-amber-300/15 dark:bg-amber-300/[0.06]">
          <p className="text-sm font-bold leading-7 text-amber-800 dark:text-amber-200">
            <strong>Risk disclosure:</strong> Cryptocurrency markets involve significant risk. TecPey does not guarantee profit or investment returns. All educational content supports informed decision-making — not speculative trading. See{" "}
            <Link href="/en/risk-disclosure" className="underline hover:no-underline">
              risk disclosure
            </Link>{" "}
            for full details.
          </p>
        </div>
      </section>
    </EnglishShell>
  );
}
