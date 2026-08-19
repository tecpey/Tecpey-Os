import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, CheckCircle2, GraduationCap, ShieldCheck, Sparkles } from "lucide-react";
import { EnglishShell } from "../../components/EnglishUI";
import { safeJsonLd } from "@/lib/json-ld";

const courseUrl = "https://tecpey.ir/en/academy/free";
const ogImage = "https://tecpey.ir/images/tecpey-og.png";

export const metadata: Metadata = {
  title: "TecPey Free Crypto Course | Safe beginner crypto education",
  description:
    "TecPey Free Crypto Course teaches crypto basics, security, exchange use, beginner analysis, risk management and educational practice without trading signals or profit promises.",
  alternates: {
    canonical: courseUrl,
    languages: {
      "fa-IR": "https://tecpey.ir/academy/free",
      "en-US": courseUrl,
      "x-default": "https://tecpey.ir/academy/free",
    },
  },
  keywords: ["free crypto course", "beginner crypto education", "learn crypto safely", "free Bitcoin course", "crypto risk management course", "TecPey Academy"],
  openGraph: {
    title: "TecPey Free Crypto Course",
    description: "Free beginner crypto education covering basics, security, exchange use, risk management and practice.",
    url: courseUrl,
    siteName: "TecPey",
    locale: "en_US",
    type: "website",
    images: [{ url: ogImage, width: 1200, height: 630, alt: "TecPey Free Crypto Course" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TecPey Free Crypto Course",
    description: "Free crypto learning path for concepts, security, risk and responsible practice.",
    images: [ogImage],
  },
};

const directAnswers = [
  {
    question: "What does TecPey Free Crypto Course include?",
    answer:
      "The course starts with crypto basics, then covers account security, wallets, exchange use, project research, beginner chart reading, risk management, market psychology and educational practice.",
  },
  {
    question: "Is this course enough to start trading?",
    answer:
      "It is a safer structured starting point, not a guarantee of market readiness. Real decisions still require practice, risk checks, personal research and responsibility.",
  },
  {
    question: "Does the free course provide signals or profit promises?",
    answer:
      "No. TecPey Academy content is educational. It must not provide buy or sell signals, guaranteed profit claims, certain price predictions or personalized financial advice.",
  },
];

const modules = [
  ["Crypto basics", "Blockchain, Bitcoin, USDT, wallets and the difference between holding assets and trading."],
  ["Security habits", "Passwords, 2FA, phishing, seed phrases, transfer networks and account protection."],
  ["Exchange basics", "Registration, fees, deposits, withdrawals, spot orders and pre-trade checks."],
  ["Risk and analysis", "Candles, trends, support/resistance, stop-loss, position sizing and journaling."],
];

const internalLinks = [
  ["TecPey Academy", "/en/academy"],
  ["Curriculum", "/en/academy"],
  ["Security guide", "/en/security"],
  ["Risk simulator", "/en/academy/risk-simulator"],
  ["Free signup", "/en/academy/signup"],
];

const relationLinks = [
  ["Bitcoin guide", "/en/coins/bitcoin"],
  ["USDT guide", "/en/coins/tether"],
  ["Ethereum guide", "/en/coins/ethereum"],
  ["CoinMarketCap", "/en/trading-tools/coinmarketcap"],
  ["CoinGecko", "/en/trading-tools/coingecko"],
  ["Crypto news", "/en/crypto-news"],
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Course",
    name: "TecPey Free Crypto Course",
    description:
      "Free beginner course for crypto concepts, security, exchange use, beginner analysis, risk management and responsible practice.",
    url: courseUrl,
    inLanguage: "en-US",
    provider: { "@type": "Organization", name: "TecPey", url: "https://tecpey.ir" },
    educationalLevel: "Beginner",
    teaches: ["Crypto basics", "Account security", "Exchange use", "Risk management", "Educational practice"],
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", courseWorkload: "P7D" },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: directAnswers.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "TecPey", item: "https://tecpey.ir/en" },
      { "@type": "ListItem", position: 2, name: "Academy", item: "https://tecpey.ir/en/academy" },
      { "@type": "ListItem", position: 3, name: "Free Crypto Course", item: courseUrl },
    ],
  },
];

export default function EnAcademyFreePage() {
  return (
    <EnglishShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }} />
      <div className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <section className="overflow-hidden rounded-[34px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.18),transparent_36%),linear-gradient(145deg,#04101d,#0f172a)] p-6 text-white shadow-[0_28px_100px_rgba(34,211,238,.12)] lg:p-8">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100"><Sparkles className="h-4 w-4" aria-hidden="true" />Free course, safer first step</div>
                <h1 className="mt-5 max-w-4xl text-balance text-3xl font-black leading-[1.15] sm:text-5xl">TecPey Free Crypto Course for responsible beginners</h1>
                <p className="mt-5 max-w-3xl text-sm font-bold leading-8 text-slate-300 sm:text-base">This is the free Academy entry point: crypto basics, security, exchange use, beginner analysis, risk management, quizzes and practice paths. The goal is education and fewer mistakes, not signals, pressure to trade or profit promises.</p>
                <div className="mt-7 flex flex-wrap gap-3"><Link href="/en/academy/signup" className="rounded-2xl bg-cyan-500 px-5 py-3.5 text-sm font-black text-white transition hover:bg-cyan-400">Sign up and start free</Link><Link href="/en/academy/term-1" className="rounded-2xl border border-white/12 bg-white/[0.055] px-5 py-3.5 text-sm font-black text-cyan-100 transition hover:bg-white/10">View Term 1</Link></div>
              </div>
              <aside className="rounded-[28px] border border-amber-300/25 bg-amber-300/10 p-5"><ShieldCheck className="h-8 w-8 text-amber-200" aria-hidden="true" /><h2 className="mt-4 text-lg font-black">Education, not financial advice</h2><p className="mt-3 text-sm font-bold leading-7 text-slate-300">No course section guarantees profit, success or real-market readiness. Market decisions require research, practice and risk management.</p></aside>
            </div>
          </section>
          <section className="grid gap-4 md:grid-cols-3">{directAnswers.map((item) => <article key={item.question} className="rounded-[24px] border border-cyan-200 bg-cyan-50 p-5"><h2 className="text-lg font-black leading-8 text-slate-950">{item.question}</h2><p className="mt-3 text-sm font-bold leading-8 text-slate-700">{item.answer}</p></article>)}</section>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{modules.map(([title, text]) => <article key={title} className="rounded-[26px] border border-cyan-200 bg-white/92 p-5 shadow-sm"><GraduationCap className="h-7 w-7 text-cyan-600" aria-hidden="true" /><h2 className="mt-4 text-base font-black text-slate-950">{title}</h2><p className="mt-2 text-sm font-bold leading-7 text-slate-600">{text}</p></article>)}</section>
          <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-[30px] border border-emerald-200 bg-white/92 p-6 shadow-sm"><BookOpenCheck className="h-8 w-8 text-emerald-500" aria-hidden="true" /><h2 className="mt-4 text-2xl font-black text-slate-950">Next learning routes</h2><div className="mt-4 flex flex-wrap gap-2">{internalLinks.map(([title, href]) => <Link key={href} href={href} className="rounded-full border border-cyan-200 bg-white px-4 py-2 text-xs font-black text-cyan-800">{title}</Link>)}</div></div><div className="rounded-[30px] border border-cyan-300/15 bg-white/92 p-6 shadow-sm"><CheckCircle2 className="h-8 w-8 text-cyan-500" aria-hidden="true" /><h2 className="mt-4 text-2xl font-black text-slate-950">Market context, not trade pressure</h2><div className="mt-4 flex flex-wrap gap-2">{relationLinks.map(([title, href]) => <Link key={href} href={href} className="rounded-full border border-cyan-200 bg-white px-4 py-2 text-xs font-black text-cyan-800">{title}</Link>)}</div></div></section>
        </div>
      </div>
    </EnglishShell>
  );
}
