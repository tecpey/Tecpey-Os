import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Careers and collaboration | TecPey",
  description: "Collaboration opportunities for content, product, support, growth and technology around TecPey.",
  alternates: { canonical: "https://tecpey.ir/en/careers" },
};

const cards = [
  { title: "Content", text: "Educational content helps users understand crypto better.", href: "/en/academy" },
  { title: "Support", text: "Reliable support is part of trust building.", href: "/en/support" },
  { title: "Product", text: "Clear product experiences help users make better decisions.", href: "/en/why-tecpey" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Careers" title="Work and collaborate with TecPey" description="Collaboration opportunities for content, product, support, growth and technology around TecPey." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
