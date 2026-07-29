import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Transparency | TecPey",
  description: "How TecPey communicates fees, risks, support paths and user education with a transparent approach.",
  alternates: { canonical: "https://tecpey.ir/en/transparency" },
};

const cards = [
  { title: "Fees", text: "Users should understand cost categories before confirming orders.", href: "/en/fees" },
  { title: "Risks", text: "Crypto risks must be explained without hype or false promises.", href: "/en/risk-disclosure" },
  { title: "Support", text: "Official support paths help users avoid confusion.", href: "/en/support" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Transparency" title="Clear information builds trust" description="How TecPey communicates fees, risks, support paths and user education with a transparent approach." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
