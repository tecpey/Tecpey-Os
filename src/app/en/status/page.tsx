import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Service status | TecPey",
  description: "A clear status page for TecPey services, markets, support and communication channels.",
  alternates: { canonical: "https://tecpey.ir/en/status" },
};

const cards = [
  { title: "Markets", text: "Market access should be monitored and communicated clearly.", href: "/en/markets" },
  { title: "Support", text: "Support availability should be easy to find.", href: "/en/support" },
  { title: "Security notices", text: "Users should follow official channels for important updates.", href: "/en/security" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Status" title="Service status and communication" description="A clear status page for TecPey services, markets, support and communication channels." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
