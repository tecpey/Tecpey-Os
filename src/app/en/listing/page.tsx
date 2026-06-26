import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Listing request | TecPey",
  description: "A page for future crypto listing and cooperation requests with TecPey.",
  alternates: { canonical: "https://tecpey.ir/en/listing" },
};

const cards = [
  { title: "Project review", text: "Future listing requests should include clear project, network and risk information.", href: undefined },
  { title: "Transparency", text: "Users need clear information before trading any listed asset.", href: "/en/transparency" },
  { title: "Contact", text: "Use official TecPey contact channels for cooperation.", href: "/en/contact-us" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Listing" title="Listing and project cooperation" description="A page for future crypto listing and cooperation requests with TecPey." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
