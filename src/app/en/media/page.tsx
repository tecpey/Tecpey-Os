import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Media kit | TecPey",
  description: "Media and brand information for TecPey with official contact and social channels.",
  alternates: { canonical: "https://tecpey.ir/en/media" },
};

const cards = [
  { title: "Brand", text: "Official TecPey brand assets for media partners, organizations and community communications.", href: undefined },
  { title: "Social channels", text: "Telegram, Instagram and Discord help users follow official updates.", href: "/en/contact-us" },
  { title: "Press contact", text: "Use official emails for media and cooperation requests.", href: "/en/contact-us" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Media" title="TecPey media and brand information" description="Media and brand information for TecPey with official contact and social channels." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
