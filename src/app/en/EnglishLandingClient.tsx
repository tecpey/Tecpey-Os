"use client";

import Link from "next/link";
import { ArrowRight, Award, BadgeCheck, BookOpen, ClipboardCheck, Gift, GraduationCap, LineChart, ShieldCheck, TrendingUp, WalletCards, Building2, MousePointerClick, HeartHandshake, TrendingDown, BookMarked, PenLine, ShieldAlert, PlayCircle, CheckCircle2 } from "lucide-react";
import { TermGateLink } from "@/components/academy/TermGateLink";
import { EnglishShell } from "./components/EnglishUI";
import { useBaseCurrenciesPrice } from "@/hooks/useBaseCurrenciesPrice";
import { HomeAiMentorSpotlight, HomeLearningJourney, CryptoNewsCenter } from "@/components/home/TecpeyHomeAI";

const features = [
  { icon: TrendingUp, title: "Online market board", text: "Learn first, then review live Bitcoin, Tether, Ethereum and other major crypto markets before making decisions." },
  { icon: ShieldCheck, title: "Security-first onboarding", text: "Account security, identity checks, anti-phishing education and 2FA habits are part of the learning path." },
  { icon: WalletCards, title: "Transparent fees", text: "Fees, withdrawal costs, network risks and risk management are taught before users take action." },
];

function usd(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "Receiving live price";
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 }).format(n)}`;
}

function resolveUsdPrice(coin: any, symbol: string) {
  if (symbol === "USDT") return 1;
  return (
    coin?.priceData?.price ??
    coin?.priceData?.last ??
    coin?.priceData?.lastPrice ??
    coin?.priceData?.close ??
    coin?.last ??
    coin?.lastPrice ??
    coin?.price ??
    0
  );
}




function GlobalUxMetricsEn() {
  const metrics = [
    { value: "7", label: "academy terms", hint: "from basics to trading psychology" },
    { value: "50+", label: "crypto dossiers", hint: "with market data and risk context" },
    { value: "20+", label: "trader tools", hint: "analysis, risk, on-chain and macro" },
    { value: "1 path", label: "safer entry", hint: "learn → analyze → practice → decide" },
  ];
  return (
    <section className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-4">
        {metrics.map((item) => (
          <div key={item.label} className="rounded-[28px] border border-cyan-200 bg-white/80 p-5 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
            <p className="text-3xl font-black text-cyan-500">{item.value}</p>
            <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">{item.label}</p>
            <p className="mt-1 text-xs font-bold leading-6 text-slate-600 dark:text-slate-300">{item.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TecpeyEcosystemFlowEn() {
  const steps = [
    { icon: BookOpen, title: "Learn", desc: "Step-by-step academy from basics to trading psychology." },
    { icon: ShieldCheck, title: "Secure", desc: "Phishing, 2FA, seed phrase, transfer networks and crisis habits." },
    { icon: LineChart, title: "Analyze", desc: "Technical, fundamental, Market Cap, FDV and market volume." },
    { icon: ClipboardCheck, title: "Tools", desc: "Position size, DCA, sentiment, on-chain and macro tools." },
    { icon: MousePointerClick, title: "Practice", desc: "Quizzes, XP, real scenarios and readiness checks." },
    { icon: TrendingUp, title: "Decide", desc: "Responsible action instead of hype-driven buying." },
  ];
  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[36px] border border-cyan-300/15 bg-slate-950 p-6 text-white shadow-2xl shadow-cyan-500/10 lg:p-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">TecPey Ecosystem</div>
          <h2 className="mt-5 text-3xl font-black leading-tight sm:text-4xl">Users do not just sign up; they move through a safer learning-to-decision path</h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-300">TecPey is designed as a guided path: understand first, secure the account, analyze the market, use tools, practice, then decide responsibly.</p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {steps.map((step, index) => (
            <div key={step.title} className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200">
                <step.icon className="h-6 w-6" />
              </div>
              <p className="mt-4 text-xs font-black text-cyan-200">Step {index + 1}</p>
              <h3 className="mt-1 text-lg font-black">{step.title}</h3>
              <p className="mt-2 text-xs font-bold leading-6 text-slate-300">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustStackGlobalEn() {
  const items = [
    ["Education-first", "Learning and readiness checks before action."],
    ["Risk-aware", "Fees, network risks, risk sizing and exit planning."],
    ["Security-first", "2FA, anti-phishing, seed phrase and safe habits."],
    ["Market intelligence", "Live prices, Market Cap, FDV, Volume and coin research."],
    ["Tool-based decisions", "Calculators and credible tools instead of guesses."],
    ["Persian clarity", "Clear learning for Persian users without overwhelming jargon."],
  ];
  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-200 bg-white/80 p-6 shadow-xl shadow-cyan-500/10 dark:border-white/10 dark:bg-white/[0.055] lg:p-8">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <div className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-100">Global trust layer</div>
            <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-4xl">Why TecPey should feel like a global product</h2>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">Before users see a trading button, they should feel that the path, risks, tools and learning steps are clear.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {items.map(([title, desc]) => (
              <div key={title} className="rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-4">
                <p className="text-xs font-black text-cyan-700 dark:text-cyan-200">{title}</p>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WhyTecpeyWasCreatedEn() {
  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 rounded-[34px] border border-cyan-200 bg-white/75 dark:bg-white/[0.055] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl lg:grid-cols-[.82fr_1.18fr] lg:p-8">
        <div>
          <div className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-100">Why TecPey was created</div>
          <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-4xl">
            So crypto entry does not begin with hype, fear or random advice
          </h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
            Many people enter crypto markets without education, without understanding risk and only based on scattered advice. TecPey was created with a simple belief: entering digital financial markets should be more informed, safer and more responsible.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["Crypto trading platform", "Buy, sell and review live markets with a simple and understandable experience."],
            ["Education before decisions", "Learn basics, security, tools and risks before serious market entry."],
            ["Evaluation and practice", "Short quizzes and real-world scenarios help users evaluate readiness."],
            ["More informed entry", "TecPey does not aim to push more trading; it aims to support safer decisions."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-[26px] border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.06] p-5">
              <HeartHandshake className="h-7 w-7 text-cyan-600" />
              <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">{title}</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyUsersLoseSectionEn() {
  const risks = [
    ["Entering without education", "Starting to trade without understanding basic concepts and risks."],
    ["Emotional decisions", "Buying and selling based on fear, greed or social media pressure."],
    ["Trusting unreliable sources", "Following unknown signals, links and anonymous recommendations."],
    ["No capital management", "Using unsuitable capital or entering without an exit plan."],
  ];

  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-200 bg-white/75 dark:bg-white/[0.055] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl lg:p-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-100">Why many people lose money in markets</div>
          <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-4xl">
            The market is not the only problem; the entry path often is
          </h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
            TecPey brings learning, practice and evaluation beside market access so users can make decisions with better preparation.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {risks.map(([title, text]) => (
            <div key={title} className="rounded-[28px] border border-rose-200 bg-rose-50 p-5">
              <TrendingDown className="h-7 w-7 text-rose-600" />
              <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">{title}</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-rose-700">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-[28px] border border-cyan-200 bg-cyan-50 p-5 text-center">
          <p className="text-base font-black leading-8 text-cyan-700">
            TecPey approach: learn → practice → evaluate → enter more consciously
          </p>
        </div>
      </div>
    </section>
  );
}


function AcademyGrowthSystemEn() {
  const terms = [
    {
      term: "Term 1",
      title: "Blockchain and crypto basics",
      lessons: ["What is blockchain?", "Bitcoin vs USDT", "What is a wallet?", "How to avoid common scams"],
      exam: "Exam 1: Crypto basics readiness",
      result: "After this term, users understand the basic ideas behind crypto markets in plain language.",
    },
    {
      term: "Term 2",
      title: "Account security and asset protection",
      lessons: ["Strong passwords", "Two-factor authentication", "Phishing and suspicious links", "Common beginner security mistakes"],
      exam: "Exam 2: Account and asset safety",
      result: "After this term, users can protect their account and digital assets more responsibly.",
    },
    {
      term: "Term 3",
      title: "Exchange use and spot trading",
      lessons: ["Registration and verification", "Viewing live markets", "Simple buy and sell actions", "Deposits, withdrawals and transfer networks"],
      exam: "Exam 3: Exchange and spot market basics",
      result: "After this term, users understand the basic steps of using a crypto trading platform.",
    },
    {
      term: "Term 4",
      title: "Beginner technical analysis",
      lessons: ["Reading candles", "Trend, support and resistance", "Trading volume", "Beginner RSI and MACD"],
      exam: "Exam 4: Reading charts",
      result: "After this term, users can understand market charts without unnecessary complexity.",
    },
    {
      term: "Term 5",
      title: "Fundamental analysis",
      lessons: ["Project team and whitepaper", "Tokenomics", "Market data", "Macro news and project risks"],
      exam: "Exam 5: Project research basics",
      result: "After this term, users can research crypto projects with more caution and structure.",
    },
    {
      term: "Term 6",
      title: "Capital management and trading psychology",
      lessons: ["Risk per trade", "Stop-loss planning", "FOMO and emotional decisions", "Trading journal"],
      exam: "Exam 6: Risk and trader behavior",
      result: "After this term, users learn to protect capital and mental discipline before chasing profit.",
    },
    {
      term: "Term 7",
      title: "Market psychology and readiness",
      lessons: ["Fear and greed", "FOMO", "Revenge trading", "Final readiness checklist"],
      exam: "Final exam: Informed entry readiness",
      result: "After this term, users can review whether they are ready to enter the market responsibly.",
    },
  ];

  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-100">TecPey Academy Path</div>
          <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-5xl">From blockchain basics to informed crypto market entry</h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300 sm:text-base">
            Each term has a clear goal: learn the key topics, practice the main ideas, take an end-of-term exam and get ready for the next step.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          {terms.map((item, index) => (
            <article key={item.term} className="group rounded-[30px] border border-cyan-200 bg-white/92 dark:bg-white/[0.055] p-5 shadow-[0_18px_55px_rgba(15,23,42,.10)] backdrop-blur-xl transition hover:-translate-y-1 hover:border-cyan-300 hover:shadow-xl hover:shadow-cyan-500/10">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-600">{item.term}</span>
                <BookMarked className="h-6 w-6 text-cyan-600" />
              </div>
              <h3 className="mt-4 text-lg font-black leading-8 text-slate-950 dark:text-white">{item.title}</h3>
              <ul className="mt-3 space-y-2">
                {item.lessons.map((lesson) => (
                  <li key={lesson} className="flex gap-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-600" />
                    <span>{lesson}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-3">
                <p className="text-xs font-black leading-6 text-cyan-700">{item.exam}</p>
              </div>
              <p className="mt-3 text-xs font-bold leading-6 text-slate-600 dark:text-slate-300">{item.result}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <TermGateLink href={`/en/academy/term-${index + 1}#term-quiz`} termNumber={index + 1} className="rounded-2xl bg-cyan-500 px-3 py-2 text-center text-xs font-black text-white shadow-[0_10px_25px_rgba(6,182,212,.22)] transition hover:bg-cyan-400" lockedClassName="bg-slate-600 hover:bg-slate-600" locale="en">Term quiz</TermGateLink>
                <a href={`/en/academy/term-${index + 1}`} className="rounded-2xl border border-cyan-200 bg-white/80 dark:bg-white/[0.06] px-3 py-2 text-center text-xs font-black text-slate-800 dark:text-slate-100 transition hover:border-cyan-400">Start lesson</a>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["End-of-term exams", "At the end of each term, short questions help users check whether they understood the core ideas."],
            ["Academy certificate", "Certificates belong to the official online or in-person academy path after completing the required learning journey."],
            ["Final readiness checklist", "Learners can continue into deeper official academy programs after completing the foundation path and readiness review."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-[28px] border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.06] p-5">
              <ClipboardCheck className="h-7 w-7 text-cyan-600" />
              <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">{title}</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
function TrustGrowthSignalsEn() {
  const opportunities = [
    ["Free advanced learning continuation", "Learners can continue with deeper free learning resources and optional official academy programs separately."],
    ["Separate official academy programs", "After readiness review, learners may continue into separate official academy programs if they choose."],
    ["TecPey Academy certificate", "Academy certificates belong to the official online or in-person academy path after completing the required learning journey."],
    ["Advanced learning guidance for top students", "Advanced learning guidance is reviewed for ready learners after completing the full academy path and meeting readiness-based criteria."],
  ];

  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-200 bg-white/75 dark:bg-white/[0.055] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl lg:p-8">
        <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-start">
          <div>
            <div className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-100">Opportunities for ready learners</div>
            <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-4xl">Education is free for everyone; responsible readiness is the goal</h2>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
              This landing page introduces the learning path. Certificates, separate official academy programs and advanced learning belong to the official academy experience and are reviewed after assessments and completion of the learning journey.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {opportunities.map(([title, text]) => (
              <div key={title} className="rounded-[28px] border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.06] p-5">
                <Award className="h-7 w-7 text-cyan-600" />
                <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">{title}</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CorporateAcademySectionEn() {
  const items = [
    ["Free employee education", "Level-one academy learning can be offered to employees in organizations and companies."],
    ["Exams and performance reports", "Learning progress, scores and readiness can be reviewed step by step."],
    ["Talent discovery", "Top performers can be identified for advanced learning, educational tracks and advanced learning."],
    ["Financial culture building", "Organizations can develop crypto literacy with a safer, structured approach."],
  ];
  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 rounded-[34px] border border-cyan-200 bg-white/75 dark:bg-white/[0.055] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <div className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-100">For organizations and companies</div>
          <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-4xl">Preparing employees for the future digital economy</h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">TecPey Academy introduces blockchain, crypto, digital security and risk management in a responsible and measurable format for organizations, companies and employee groups.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map(([title, text]) => (
            <div key={title} className="rounded-[26px] border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.06] p-5">
              <Building2 className="h-7 w-7 text-cyan-600" />
              <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">{title}</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}



function AcademyOfficialClarificationEn() {
  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-amber-200 bg-amber-50 p-6 shadow-2xl shadow-amber-500/10 lg:p-8 dark:border-amber-300/20 dark:bg-amber-300/10">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-black text-amber-700 dark:bg-white/10 dark:text-amber-100">TecPey Academy clarity</div>
          <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-4xl">Free path vs official TecPey Academy</h2>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">
            The free path on this website is designed for awareness, basic learning and initial self-assessment. Official certificates or advanced courses belong to separate online or in-person TecPey Academy programs and are not part of the landing learning path.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-[28px] border border-cyan-200 bg-white/90 p-5 dark:border-cyan-300/15 dark:bg-white/[0.055]">
            <h3 className="text-xl font-black text-slate-950 dark:text-white">Free website path</h3>
            <p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">Introductory learning, short quizzes, initial knowledge assessment and safer market awareness.</p>
          </div>
          <div className="rounded-[28px] border border-amber-200 bg-white/90 p-5 dark:border-amber-300/15 dark:bg-white/[0.055]">
            <h3 className="text-xl font-black text-slate-950 dark:text-white">Official TecPey Academy</h3>
            <p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">Online or in-person classes, mentors, projects and official certificates after separate academy enrollment and evaluation.</p>
          </div>
        </div>
        <p className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-center text-sm font-black leading-8 text-rose-800 dark:border-rose-300/20 dark:bg-rose-400/10 dark:text-rose-100">
          Completing the free path alone does not grant advanced learning, educational tracks, employment or an official certificate.
        </p>
      </div>
    </section>
  );
}


function LearningExperienceSystemEn() {
  const cards = [
    { icon: PlayCircle, title: "Short lesson", text: "Each lesson focuses on one clear topic, such as USDT, wallets, phishing or stop-loss planning." },
    { icon: PenLine, title: "Quick question", text: "After each lesson, a simple question helps users check whether they understood the main point." },
    { icon: ShieldAlert, title: "Real situation practice", text: "Users face situations such as suspicious links, market drops or choosing a transfer network." },
    { icon: ClipboardCheck, title: "End-of-term exam", text: "At the end of each term, a short exam shows whether the user is ready for the next step." },
  ];

  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-200 bg-white/75 dark:bg-white/[0.055] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl lg:p-8">
        <div className="grid gap-8 lg:grid-cols-[.78fr_1.22fr] lg:items-start">
          <div>
            <div className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-100">How learning works in TecPey</div>
            <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-4xl">Simple, step-by-step and easy to follow</h2>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
              Users do not need to start with heavy trading terms. TecPey begins with basic concepts, then adds practice and short exams to help users understand whether they are ready for the next term.
            </p>
            <div className="mt-5 rounded-3xl border border-cyan-200 bg-cyan-50 p-4">
              <p className="text-sm font-black leading-7 text-cyan-700">
                Suggested path: short lesson → quick question → real situation practice → end-of-term exam → next step readiness
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {cards.map((item) => (
              <div key={item.title} className="rounded-[28px] border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.06] p-5">
                <div className="flex h-13 w-13 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-600">
                  <item.icon className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
export default function EnglishLandingClient({ schema }: { schema: React.ReactNode }) {
  const { currencies } = useBaseCurrenciesPrice(["BTCUSDT", "ETHUSDT", "USDTUSDT", "TONUSDT"]);
  const fallback = [
    { symbol: "BTC", name: "Bitcoin", priceData: { last: 0 } },
    { symbol: "USDT", name: "Tether", priceData: { last: 1 } },
    { symbol: "ETH", name: "Ethereum", priceData: { last: 0 } },
    { symbol: "TON", name: "Toncoin", priceData: { last: 0 } },
  ];
  const rows = (currencies.length ? currencies : fallback).slice(0, 6);

  return (
    <EnglishShell>
      {schema}
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
          <div className="text-left">
            <div className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-100">Education, live market and secure entry in one clear path</div>
            <h1 className="mt-6 text-4xl font-black leading-tight text-slate-950 dark:text-white sm:text-6xl">TecPey — Your Safe Entry Point to the Crypto Market</h1>
            <p className="mt-6 max-w-3xl text-lg leading-9 text-slate-600 dark:text-slate-300">
              TecPey is a crypto trading platform that brings buying, selling and digital asset management together with education, evaluation and a learning path for more informed entry into digital financial markets.
            </p>
            <div className="mt-5 inline-flex rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-800 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-100">
              Free education for everyone; professional opportunities for ready learners
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-start">
              <Link href="https://my.tecpey.ir" className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400 hover:shadow-2xl">
                Enter Exchange
                <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
              </Link>
              <div className="flex flex-col items-center gap-1.5 sm:items-start">
                <Link href="/en/academy" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-lg dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
                  Enter Academy
                  <LineChart className="h-5 w-5 text-cyan-500" />
                </Link>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">For a confident start, the Academy is with you.</p>
              </div>
            </div>
          </div>

          <div className="rounded-[34px] border border-cyan-200 bg-white dark:bg-white/[0.055] p-4 shadow-2xl shadow-cyan-500/10 sm:p-6">
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">TecPey Online Market Board</h2>
            <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">Live market prices · USD/USDT</p>
            <div className="mt-4 space-y-2">
              {rows.map((coin: any, index: number) => {
                const symbol = String(coin?.symbol ?? coin?.priceData?.symbol?.replace("USDT", "") ?? "").replace("USDT", "");
                const name = coin?.name ?? symbol;
                const price = resolveUsdPrice(coin, symbol);
                return (
                  <div key={`${symbol}-${index}`} className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 dark:border-white/10 p-3">
                    <span className="truncate text-sm font-bold">{name || symbol} / USD</span>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-600 sm:px-3 sm:text-xs">{usd(price)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <CryptoNewsCenter locale="en" compact />
      <HomeAiMentorSpotlight locale="en" />
      <HomeLearningJourney locale="en" />


      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-200 bg-white/70 dark:bg-white/[0.06] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-100">TecPey Academy Growth Path</div>
            <h2 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">From a complete beginner to a safer crypto market participant</h2>
            <p className="mt-4 text-base leading-8 text-slate-600 dark:text-slate-300">
              All education in the website path is free. Advanced courses or official certificates are separate academy programs; the landing path focuses on awareness, security and responsible readiness.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
            {[
              { icon: ShieldCheck, title: "Safe entry", text: "Money basics, Bitcoin, USDT, blockchain, account security, 2FA, essential tools and using TecPey." },
              { icon: TrendingUp, title: "Market literacy", text: "Market cap, volume, liquidity, cycles, order types, spreads and beginner capital management." },
              { icon: LineChart, title: "Technical analysis", text: "Candles, trends, support, resistance, RSI, MACD, moving averages and beginner price action." },
              { icon: ClipboardCheck, title: "Trading process", text: "Watchlists, journals, backtesting, position management and risk-aware trading plans." },
              { icon: BookOpen, title: "Fundamental analysis", text: "Tokenomics, whitepapers, teams, TVL, on-chain data, macro news, ETFs, CPI and interest rates." },
              { icon: BadgeCheck, title: "Trading psychology", text: "FOMO, FUD, fear, greed, discipline, stop-loss planning and avoiding liquidation." },
              { icon: Gift, title: "Readiness path", text: "Final assessment, readiness checklist, review guidance and continued learning resources." },
            ].map((step) => (
              <div key={step.title} className="group rounded-[28px] border border-cyan-200 bg-white/70 dark:bg-white/[0.06] p-5 shadow-lg shadow-cyan-500/5 backdrop-blur-xl transition hover:-translate-y-1 hover:border-cyan-300">
                <div className="flex h-13 w-13 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-600">
                  <step.icon className="h-7 w-7" />
                </div>
                <h3 className="mt-5 text-lg font-black">{step.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <GlobalUxMetricsEn />
      <WhyTecpeyWasCreatedEn />
      <WhyUsersLoseSectionEn />
      <TecpeyEcosystemFlowEn />
      <TrustStackGlobalEn />
      <AcademyGrowthSystemEn />
      <AcademyOfficialClarificationEn />
      <section className="px-4 pb-16 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl rounded-[30px] border border-cyan-200 bg-cyan-50 p-6 text-center dark:border-cyan-300/15 dark:bg-cyan-300/10"><h2 className="text-2xl font-black text-slate-950 dark:text-white">Knowledge Center: Trader Toolbox</h2><p className="mt-3 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">Learn practical tools for analysis, risk management, news, on-chain data and project research.</p><a href="/en/trading-tools" className="mt-5 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">View trading tools</a></div></section>
      <LearningExperienceSystemEn />
      <TrustGrowthSignalsEn />
      <CorporateAcademySectionEn />
      


      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: GraduationCap, title: "Free academy, serious structure", text: "TecPey Academy is free, but it is not casual content. Every term has a clear outcome, a short assessment and a readiness signal for the next step." },
              { icon: ClipboardCheck, title: "Four-question term checks", text: "After each term, users answer four key questions from that lesson. Correct answers turn green, incorrect options turn red and the score appears instantly." },
              { icon: Award, title: "Responsible readiness", text: "Learners who complete the foundation path can continue with deeper official academy programs separately, without mixing prizes or financial promises into this landing path." },
            ].map((item) => (
              <div key={item.title} className="rounded-[30px] border border-cyan-200 bg-white/75 dark:bg-white/[0.055] p-6 shadow-xl shadow-cyan-500/5 backdrop-blur-xl transition hover:-translate-y-1 hover:border-cyan-300">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-600">
                  <item.icon className="h-7 w-7" />
                </div>
                <h2 className="mt-5 text-xl font-black text-slate-950 dark:text-white">{item.title}</h2>
                <p className="mt-3 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 rounded-[34px] border border-cyan-200 bg-white/75 dark:bg-white/[0.055] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl lg:grid-cols-[.85fr_1.15fr] lg:p-8">
          <div>
            <div className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-100">TecPey Learning Standard</div>
            <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-4xl">Designed to earn trust before the first trade</h2>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
              TecPey does not push users into rushed trading. The landing experience, academy, market board and assessments all repeat the same promise: learn first, verify readiness, then enter the market with better judgment.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Term outcome", "Every term explains what the user should be able to do after learning."],
              ["Tools and websites", "Users learn essential tools such as 2FA, password managers, TradingView, CoinMarketCap and CoinGecko."],
              ["Risk-first mindset", "Technical and fundamental analysis are taught together with capital protection and trading psychology."],
              ["Community memory", "Users should remember TecPey as the place where they entered crypto safely, not just another exchange."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-[26px] border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.06] p-5">
                <h3 className="text-lg font-black text-slate-950 dark:text-white">{title}</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-200 bg-white/75 dark:bg-white/[0.055] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl lg:p-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-100">FAQ for safer onboarding</div>
            <h2 className="mt-5 text-3xl font-black text-slate-950 dark:text-white sm:text-4xl">Clear answers before users start</h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              ["Is TecPey Academy free?", "Yes. The academy path is designed to be free for users, from crypto basics to technical analysis, fundamental analysis, risk management and trading psychology."],
              ["Does this path promise prizes or profit?", "No. This path is educational. It does not promise profit, prizes or financial outcomes."],
              ["Is this suitable for employees and complete beginners?", "Yes. The path starts from safe setup, essential tools, exchange use and market literacy before advanced trading topics."],
              ["Why does TecPey use exams?", "Short exams help users verify understanding before moving forward and identify which concepts need review."],
            ].map(([q, a]) => (
              <div key={q} className="rounded-[26px] border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.06] p-5">
                <h3 className="text-lg font-black text-slate-950 dark:text-white">{q}</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {features.map((item) => (
            <div key={item.title} className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.055] p-6 shadow-sm transition hover:-translate-y-1 hover:border-cyan-200 hover:shadow-lg">
              <item.icon className="h-8 w-8 text-cyan-500" />
              <h2 className="mt-4 text-xl font-black">{item.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mobile sticky CTA — two equal buttons, always visible on mobile */}
      <div className="sticky-cta-bar fixed inset-x-0 bottom-0 z-50 border-t border-cyan-300/20 bg-slate-950/92 px-3 pt-3 shadow-[0_-18px_50px_rgba(0,0,0,.35)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-md gap-2">
          <Link href="https://my.tecpey.ir" className="flex flex-1 items-center justify-center rounded-2xl bg-cyan-500 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400">
            Enter Exchange
          </Link>
          <Link href="/en/academy" className="flex flex-1 items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 text-sm font-black text-white backdrop-blur transition hover:bg-white/15">
            Enter Academy
          </Link>
        </div>
      </div>
    </EnglishShell>
  );
}
