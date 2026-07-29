import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Methodology | TecPey",
  description: "How TecPey structures educational crypto content, FAQs, glossary entries and market guides.",
  alternates: { canonical: "https://tecpey.ir/en/methodology" },
};

const cards = [
  { title: "User-first questions", text: "Content starts from real questions users ask before trading.", href: undefined },
  { title: "Clear structure", text: "Pages use summaries, sections and FAQs to make learning easier.", href: undefined },
  { title: "Risk-aware tone", text: "TecPey avoids profit promises and explains risks clearly.", href: "/en/risk-disclosure" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Methodology" title="How TecPey creates helpful content" description="How TecPey structures educational crypto content, FAQs, glossary entries and market guides." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
