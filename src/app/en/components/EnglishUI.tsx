import Link from "next/link";
import { NeonIcon } from "@/components/tecpey/NeonIcon";
import { ArrowRight, CheckCircle2, Search, Sparkles, ExternalLink } from "lucide-react";

export const enNav = [
  { label: "Home", href: "/en" },
  { label: "Markets", href: "/en/markets" },
  { label: "Coins", href: "/en/coins" },
  { label: "Academy", href: "/en/academy" },
  { label: "Security", href: "/en/security" },
  { label: "Contact", href: "/en/contact-us" },
];

export function EnglishShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      dir="ltr"
      className="tecpey-enterprise min-h-screen bg-[color:var(--tp-bg)] pb-24 pt-28 text-left text-[color:var(--tp-text)] lg:pb-0"
    >
      {children}
    </main>
  );
}

export function EnglishHero({
  eyebrow,
  title,
  description,
  ctaHref = "/en/markets",
  ctaLabel = "View markets",
  secondaryHref = "/en/start-guide",
  secondaryLabel = "Start guide",
}: {
  eyebrow: string;
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="relative overflow-hidden px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
      {/* Background radial gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.18),transparent_34%),radial-gradient(circle_at_20%_80%,rgba(30,64,175,.10),transparent_32%)]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="max-w-4xl text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-600 dark:text-cyan-200">
            <Sparkles className="h-3.5 w-3.5" />
            {eyebrow}
          </div>
          <h1 className="mt-6 text-balance text-4xl font-black leading-[1.15] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
            {description}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={ctaHref}
              className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
            >
              {ctaLabel}
              <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </Link>
            <Link
              href={secondaryHref}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-lg dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
            >
              {secondaryLabel}
              <Search className="h-5 w-5 text-cyan-500" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function EnglishCard({ title, text, href }: { title: string; text: string; href?: string }) {
  const body = (
    <div className="group h-full rounded-[30px] border border-cyan-300/15 bg-[color:var(--tp-card)] p-6 text-left shadow-[0_20px_70px_rgba(0,0,0,.12)] backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-[0_28px_85px_rgba(34,211,238,.16)] dark:bg-[#07111f] dark:shadow-[0_20px_70px_rgba(0,0,0,.28)] focus:outline-none focus:ring-2 focus:ring-cyan-300/60">
      <NeonIcon icon={CheckCircle2} size="md" />
      <h3 className="mt-5 text-xl font-black leading-8 text-slate-950 dark:text-white">{title}</h3>
      <p className="mt-3 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{text}</p>
      {href && (
        <div className="mt-5 inline-flex items-center gap-2 text-sm font-black text-cyan-500 opacity-0 transition group-hover:opacity-100 dark:text-cyan-300">
          Read more <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full focus:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EnglishSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-600 dark:text-cyan-200">
      {children}
    </div>
  );
}

export function EnglishCTA({
  title,
  description,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: {
  title: string;
  description?: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="px-4 pb-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[34px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.20),transparent_40%),#06111f] p-8 text-center shadow-2xl shadow-cyan-500/10 lg:p-12">
        <h2 className="text-3xl font-black text-white sm:text-4xl">{title}</h2>
        {description && (
          <p className="mx-auto mt-4 max-w-2xl text-sm font-bold leading-8 text-slate-300">{description}</p>
        )}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={primaryHref}
            className="group inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-7 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/25 transition hover:-translate-y-0.5 hover:bg-cyan-400 hover:shadow-2xl"
          >
            {primaryLabel}
            <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
          </Link>
          {secondaryLabel && secondaryHref && (
            <Link
              href={secondaryHref}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-7 py-4 text-sm font-black text-white backdrop-blur transition hover:bg-white/15"
            >
              {secondaryLabel}
              <ExternalLink className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
