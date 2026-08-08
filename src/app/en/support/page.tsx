import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, LifeBuoy, MailCheck, ShieldAlert } from "lucide-react";
import { EnglishShell } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Support Center | TecPey",
  description: "Official TecPey support paths for account access, security, fees, markets and onboarding questions.",
  alternates: { canonical: "https://tecpey.ir/en/support" },
};

const supportPaths = [
  {
    icon: LifeBuoy,
    title: "Account or access issue",
    text: "Use the official contact path when registration, login, verification or account access needs review.",
    href: "/en/contact-us",
    action: "Contact support",
  },
  {
    icon: ShieldAlert,
    title: "Security concern",
    text: "Start from the security page for suspicious links, phishing messages, unknown login attempts or account risk.",
    href: "/en/security",
    action: "Review security",
  },
  {
    icon: BookOpenCheck,
    title: "Learning question",
    text: "For beginner questions about fees, risk and market basics, read the Academy and FAQ before trading.",
    href: "/en/faq",
    action: "Open FAQ",
  },
];

const beforeContact = [
  "Keep the email or phone number connected to the account ready.",
  "For financial issues, keep screenshots and timing details without sharing passwords or verification codes.",
  "Follow only official TecPey paths and avoid replying to unknown messages.",
];

export default function Page() {
  return (
    <EnglishShell>
      <section className="relative isolate overflow-hidden px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.18),transparent_30%),radial-gradient(circle_at_15%_25%,rgba(37,99,235,.12),transparent_28%)]" />
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-700 dark:text-cyan-300">
              Official support desk
            </div>
            <h1 className="mt-6 text-balance text-4xl font-black leading-[1.12] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
              Financial questions need a support path you can trust and track.
            </h1>
            <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
              TecPey support routes account, security, fee, market and onboarding questions through official channels.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/en/contact-us"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-cyan-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:focus-visible:ring-offset-slate-950"
              >
                Contact TecPey
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/en/security"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-6 py-4 text-sm font-black text-slate-900 shadow-sm transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                Check account security
              </Link>
            </div>
          </div>

          <aside className="rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-2xl shadow-cyan-500/10">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-white/8">
                <Image src="/logo.png" alt="Official TecPey logo" width={44} height={44} priority />
              </div>
              <div>
                <p className="text-sm font-black text-cyan-200">Before you contact us</p>
                <p className="mt-1 text-xs leading-6 text-white/65">Sensitive data belongs only in official TecPey flows.</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {beforeContact.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/6 p-4">
                  <MailCheck className="mt-1 h-5 w-5 shrink-0 text-cyan-300" />
                  <p className="text-sm font-bold leading-7 text-white/78">{item}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-3">
          {supportPaths.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="group flex min-h-[260px] flex-col rounded-[28px] border border-slate-200 bg-white/85 p-6 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-xl hover:shadow-cyan-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-white/10 dark:bg-white/5"
            >
              <item.icon className="h-8 w-8 text-cyan-700 dark:text-cyan-300" />
              <h2 className="mt-5 text-xl font-black leading-8 text-slate-950 dark:text-white">{item.title}</h2>
              <p className="mt-3 flex-1 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.text}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-cyan-700 dark:text-cyan-300">
                {item.action}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </EnglishShell>
  );
}
