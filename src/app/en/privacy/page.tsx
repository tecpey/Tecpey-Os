import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Privacy | TecPey",
  description: "TecPey privacy principles for user data, communication clarity and responsible handling of account-related information.",
  alternates: { canonical: "https://tecpey.ir/en/privacy" },
};

const cards = [
  { title: "Minimal data mindset", text: "User data should be collected only when it supports security and service needs.", href: undefined },
  { title: "Official channels", text: "Sensitive account communication should happen only through official TecPey paths.", href: "/en/contact-us" },
  { title: "Transparency", text: "Users should understand how to reach TecPey and how to protect their information.", href: "/en/security" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Privacy" title="Privacy and responsible communication" description="TecPey privacy principles for user data, communication clarity and responsible handling of account-related information." ctaHref="/en/markets" ctaLabel="View markets" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
