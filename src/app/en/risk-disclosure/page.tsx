import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Crypto risk disclosure | TecPey",
  description: "Important crypto market risks including price volatility, transfer mistakes, network selection and account security.",
  alternates: { canonical: "https://tecpey.ir/en/risk-disclosure" },
};

const cards = [
  { title: "Price volatility", text: "Crypto prices can change quickly and profit is never guaranteed.", href: undefined },
  { title: "Transfer risk", text: "Wrong networks or addresses can cause irreversible loss.", href: undefined },
  { title: "Account security", text: "Strong passwords, 2FA habits and anti-phishing awareness are essential.", href: "/en/security" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Risk Disclosure" title="Understand crypto risks before trading" description="Important crypto market risks including price volatility, transfer mistakes, network selection and account security." ctaHref="/en/security" ctaLabel="Security center" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
