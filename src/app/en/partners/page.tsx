import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Partners | TecPey",
  description: "Partnership and ecosystem cooperation page for TecPey.",
  alternates: { canonical: "https://tecpey.ir/en/partners" },
};

const cards = [
  { title: "Content partners", text: "Educational and media cooperation can support user awareness.", href: "/en/media" },
  { title: "Business partners", text: "Business requests should start through official channels.", href: "/en/business" },
  { title: "Support partners", text: "Reliable support helps build user trust.", href: "/en/support" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Partners" title="Partnership paths with TecPey" description="Partnership and ecosystem cooperation page for TecPey." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
