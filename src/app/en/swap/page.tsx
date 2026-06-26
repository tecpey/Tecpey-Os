import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Quick crypto conversion | TecPey",
  description: "A clear entry page for users who want to review markets and understand crypto conversion before trading.",
  alternates: { canonical: "https://tecpey.ir/en/swap" },
};

const cards = [
  { title: "Market review", text: "Check major assets before making a conversion decision.", href: "/en/markets" },
  { title: "Fees", text: "Understand cost categories before confirming an action.", href: "/en/fees" },
  { title: "Security", text: "Review safe transfer habits before moving crypto.", href: "/en/security" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Swap" title="Understand conversion before you trade" description="A clear entry page for users who want to review markets and understand crypto conversion before trading." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
