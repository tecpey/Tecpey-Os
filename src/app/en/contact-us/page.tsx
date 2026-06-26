import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../components/EnglishUI";
import { Mail, MapPin, Phone, Smartphone, Clock3, MessageSquare, Send } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact TecPey | Support and office information",
  description: "Official TecPey contact details, support emails, phone numbers and office information in Babol, Mazandaran, Iran.",
  alternates: { canonical: "https://tecpey.ir/en/contact-us" },
};

const contactCards = [
  {
    icon: MapPin,
    title: "TecPey Head Office",
    text: "Babol, Mazandaran, Iran — Chaharrah Tondast, next to Cristal, TechnoPardakht office.",
    href: "https://www.google.com/maps/search/?api=1&query=Babol+Mazandaran+Chaharrah+Tondast",
  },
  { icon: Phone, title: "Office phone", text: "+98 11 3233 8026", href: "tel:+981132338026" },
  { icon: Smartphone, title: "Mobile", text: "+98 911 116 6440", href: "tel:+989111166440" },
  { icon: Mail, title: "General email", text: "info@tecpey.ir", href: "mailto:info@tecpey.ir" },
  { icon: Mail, title: "Support email", text: "support@tecpey.ir", href: "mailto:support@tecpey.ir" },
  { icon: Clock3, title: "Support hours", text: "Sat – Thu, 09:00 – 18:00 IRST", href: undefined },
];

const socials = [
  { label: "Telegram", handle: "@tecpeyco", href: "https://t.me/tecpeyco", color: "border-sky-400/25 bg-sky-400/10 text-sky-300" },
  { label: "Instagram", handle: "@tecpeyco", href: "https://instagram.com/tecpeyco", color: "border-pink-400/25 bg-pink-400/10 text-pink-300" },
  { label: "Discord", handle: "tecpeyex", href: "https://discord.gg/tecpeyex", color: "border-violet-400/25 bg-violet-400/10 text-violet-300" },
];

export default function Page() {
  return (
    <EnglishShell>
      {/* Hero */}
      <section className="relative overflow-hidden px-4 py-14 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.18),transparent_34%)]" />
        <div className="relative mx-auto max-w-7xl text-left">
          <div className="tp-label mb-6">
            <MessageSquare className="h-3.5 w-3.5" />
            Contact TecPey
          </div>
          <h1 className="max-w-3xl text-balance text-4xl font-black leading-[1.15] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
            We are here to help and respond
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
            For registration, markets, partnerships or support — use only official TecPey channels listed here.
          </p>
        </div>
      </section>

      {/* Contact cards */}
      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contactCards.map((card) => {
            const inner = (
              <div className="tp-card group h-full p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-500 transition group-hover:bg-cyan-300/20">
                  <card.icon className="h-6 w-6" />
                </div>
                <h2 className="mt-5 text-xl font-black text-slate-950 dark:text-white">{card.title}</h2>
                <p className="mt-3 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{card.text}</p>
              </div>
            );
            return card.href ? (
              <Link key={card.title} href={card.href} className="block h-full focus:outline-none">
                {inner}
              </Link>
            ) : (
              <div key={card.title}>{inner}</div>
            );
          })}
        </div>
      </section>

      {/* Form + Socials */}
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_.75fr]">
          {/* Form */}
          <div className="tp-card p-8">
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">Send a message</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">
              This form is for initial contact. For faster support, email{" "}
              <a href="mailto:support@tecpey.ir" className="text-cyan-500 hover:underline">
                support@tecpey.ir
              </a>{" "}
              or use official Telegram.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <input
                className="rounded-2xl border border-cyan-300/20 bg-white/50 px-4 py-3 text-sm font-bold outline-none placeholder:text-slate-400 transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-300/30 dark:bg-white/[0.05] dark:text-white"
                placeholder="Full name"
              />
              <input
                className="rounded-2xl border border-cyan-300/20 bg-white/50 px-4 py-3 text-sm font-bold outline-none placeholder:text-slate-400 transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-300/30 dark:bg-white/[0.05] dark:text-white"
                placeholder="Email or phone"
              />
              <input
                className="rounded-2xl border border-cyan-300/20 bg-white/50 px-4 py-3 text-sm font-bold outline-none placeholder:text-slate-400 transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-300/30 dark:bg-white/[0.05] dark:text-white md:col-span-2"
                placeholder="Subject"
              />
              <textarea
                className="min-h-32 rounded-2xl border border-cyan-300/20 bg-white/50 px-4 py-3 text-sm font-bold outline-none placeholder:text-slate-400 transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-300/30 dark:bg-white/[0.05] dark:text-white md:col-span-2"
                placeholder="Your message"
              />
            </div>
            <Link
              href="mailto:info@tecpey.ir"
              className="group mt-6 inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400"
            >
              <Send className="h-4 w-4 transition group-hover:translate-x-1" />
              Send message to support
            </Link>
          </div>

          {/* Socials */}
          <div className="rounded-[30px] border border-cyan-300/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,.18),transparent_38%),linear-gradient(145deg,#07111f,#0f172a)] p-8 text-white">
            <h2 className="text-2xl font-black">Official TecPey channels</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-slate-300">
              For announcements, news and Persian crypto education — follow only official accounts listed here.
            </p>
            <div className="mt-6 space-y-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-sm font-black transition hover:-translate-y-0.5 ${s.color}`}
                >
                  <span className="flex-1">{s.label}</span>
                  <span className="font-bold opacity-70">{s.handle}</span>
                </a>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
              <p className="text-xs font-bold leading-6 text-amber-200">
                ⚠️ TecPey never asks for passwords or verification codes via chat. Avoid suspicious links and unofficial accounts.
              </p>
            </div>
          </div>
        </div>
      </section>
    </EnglishShell>
  );
}
