import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../components/EnglishUI";
import { StructuredData, breadcrumbSchema } from "@/components/seo/StructuredData";
import { ShieldCheck, Lock, AlertTriangle, Eye, Key, Smartphone, ArrowRight, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Security Center | TecPey",
  description: "TecPey Security Center: account protection, anti-phishing guidance, safe transfers, verification habits and crypto risk reduction.",
  alternates: { canonical: "https://tecpey.ir/en/security" },
};

const protections = [
  {
    icon: Lock,
    title: "Account protection",
    text: "Use strong, unique passwords for your TecPey account. Enable two-factor authentication. Never share login credentials with anyone.",
    tips: ["Minimum 10-character password", "Use a password manager", "Never share passwords"],
  },
  {
    icon: Key,
    title: "Two-factor authentication",
    text: "Verification codes are your second line of defense. Treat every code as a private security key — never share them, even with TecPey support.",
    tips: ["Use an authenticator app", "Never share codes", "Code requests from others are fraud"],
  },
  {
    icon: Eye,
    title: "Anti-phishing awareness",
    text: "Always verify the official TecPey domain before entering credentials. Phishing sites copy official designs to steal accounts.",
    tips: ["Check URL: tecpey.ir only", "Bookmark the official site", "Avoid links from unknown sources"],
  },
  {
    icon: AlertTriangle,
    title: "Safe transfers",
    text: "Before confirming any crypto transfer: verify the destination address, network, amount and fees. Wrong network = permanent loss.",
    tips: ["Double-check the address", "Verify the network type", "Test with a small amount first"],
  },
  {
    icon: Smartphone,
    title: "Device control",
    text: "Review active sessions regularly and sign out of unrecognized devices. Keep your device OS and apps updated.",
    tips: ["Review sessions in settings", "Sign out unused devices", "Keep software updated"],
  },
  {
    icon: ShieldCheck,
    title: "Report suspicious activity",
    text: "If you notice suspicious login attempts, unexpected transfers or unusual activity — contact TecPey through official channels immediately.",
    tips: ["Email: support@tecpey.ir", "Official Telegram: @tecpeyco", "Do not delay reporting"],
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "Is security only the platform's responsibility?", acceptedAnswer: { "@type": "Answer", text: "No. Secure infrastructure matters, but user behavior — like checking domains and protecting verification codes — is equally essential." } },
    { "@type": "Question", name: "What should I do after clicking a suspicious link?", acceptedAnswer: { "@type": "Answer", text: "Change your password immediately, review active sessions and contact TecPey through official channels only." } },
  ],
};

export default function Page() {
  return (
    <EnglishShell>
      <StructuredData data={[faqSchema, breadcrumbSchema([{ name: "Home", url: "https://tecpey.ir/en" }, { name: "Security", url: "https://tecpey.ir/en/security" }])]} />

      {/* Hero */}
      <section className="relative overflow-hidden px-4 py-14 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.18),transparent_34%),radial-gradient(circle_at_15%_75%,rgba(16,185,129,.10),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl text-left">
          <div className="tp-label mb-6">
            <ShieldCheck className="h-3.5 w-3.5" />
            Security Center
          </div>
          <h1 className="max-w-4xl text-balance text-4xl font-black leading-[1.15] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
            Account and asset security come first
          </h1>
          <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
            TecPey teaches security as the first step — before markets, before trading. Learn how to protect your account, recognize phishing and transfer assets safely.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/en/academy" className="group inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400">
              Academy security lessons <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </Link>
            <Link href="/en/contact-us" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/[0.06] dark:text-white">
              Report an issue
            </Link>
          </div>
        </div>
      </section>

      {/* Security cards */}
      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2 lg:grid-cols-3">
          {protections.map((item) => (
            <div key={item.title} className="tp-card p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-500">
                <item.icon className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-xl font-black text-slate-950 dark:text-white">{item.title}</h2>
              <p className="mt-3 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{item.text}</p>
              <ul className="mt-4 space-y-2">
                {item.tips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Warning banner */}
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[28px] border border-rose-300/25 bg-rose-50 p-6 dark:border-rose-300/15 dark:bg-rose-300/[0.06]">
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div>
              <h3 className="text-base font-black text-rose-800 dark:text-rose-200">TecPey will NEVER ask for</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-rose-700 dark:text-rose-300">
                Your password · Your 2FA codes · Your seed phrase · Remote access to your device · Payments to &quot;verify&quot; your account.
                If anyone claims to be TecPey support and asks for these — it is fraud. Contact{" "}
                <a href="mailto:support@tecpey.ir" className="underline hover:no-underline">
                  support@tecpey.ir
                </a>{" "}
                immediately.
              </p>
            </div>
          </div>
        </div>
      </section>
    </EnglishShell>
  );
}
