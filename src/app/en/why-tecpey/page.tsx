import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Why TecPey? | Crypto exchange experience",
  description: "Why TecPey focuses on live markets, security, transparent fees, user education and local support.",
  alternates: { canonical: "https://tecpey.ir/en/why-tecpey" },
};

const cards = [
  { title: "Local support", text: "TecPey provides real contact paths and local business identity in Babol, Mazandaran.", href: "/en/contact-us" },
  { title: "Education-first", text: "Users can read guides, glossary terms and FAQs before trading.", href: "/en/academy" },
  { title: "Security-minded", text: "Account security and phishing awareness are part of the user experience.", href: "/en/security" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Why TecPey" title="A clearer way to start crypto trading" description="Why TecPey focuses on live markets, security, transparent fees, user education and local support." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
