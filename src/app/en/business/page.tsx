import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Business solutions | TecPey",
  description: "TecPey business collaboration paths for payment, crypto acceptance, content, support and partnerships.",
  alternates: { canonical: "https://tecpey.ir/en/business" },
};

const cards = [
  { title: "Partnerships", text: "Discuss business opportunities through official TecPey channels.", href: "/en/contact-us" },
  { title: "Listing requests", text: "Projects can review future listing and cooperation paths.", href: "/en/listing" },
  { title: "Support", text: "Business questions should be routed to official contact channels.", href: "/en/support" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Business" title="Business collaboration with TecPey" description="TecPey business collaboration paths for payment, crypto acceptance, content, support and partnerships." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
