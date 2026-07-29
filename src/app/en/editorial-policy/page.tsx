import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Editorial policy | TecPey",
  description: "TecPey editorial principles for educational crypto content, transparency, risk awareness and user clarity.",
  alternates: { canonical: "https://tecpey.ir/en/editorial-policy" },
};

const cards = [
  { title: "No profit promises", text: "Educational content is not financial advice and does not guarantee outcomes.", href: undefined },
  { title: "Regular review", text: "Crypto topics change quickly and content should be reviewed over time.", href: undefined },
  { title: "Risk clarity", text: "Important risks should be included with benefits and use cases.", href: "/en/risk-disclosure" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Editorial Policy" title="Educational content without hype" description="TecPey editorial principles for educational crypto content, transparency, risk awareness and user clarity." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
