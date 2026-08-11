import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Conversion Education — Launch-Gated | TecPey",
  description: "An educational entry page for users who want to review markets and understand crypto conversion before any real-money decision.",
  alternates: { canonical: "https://tecpey.ir/en/swap" },
};

const cards = [
  { title: "Market review", text: "Check major assets before making any real-money decision.", href: "/en/markets" },
  { title: "Fees", text: "Understand cost categories before a real conversion is available.", href: "/en/fees" },
  { title: "Practice first", text: "Use virtual practice before any live trading or transfer scope is certified.", href: "/en/academy" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Conversion Education" title="Understand conversion before any real-money decision" description="Real-money conversion, deposits, withdrawals and trading remain launch-gated until security, operations and compliance evidence is accepted." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
