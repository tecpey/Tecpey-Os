import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Support Center | TecPey",
  description: "Find support paths for account, security, fees, onboarding and general TecPey questions.",
  alternates: { canonical: "https://tecpey.ir/en/support" },
};

const cards = [
  { title: "Account questions", text: "Use official support for registration and account access questions.", href: "/en/contact-us" },
  { title: "Security questions", text: "Report suspicious links, login issues and phishing concerns.", href: "/en/security" },
  { title: "Fee questions", text: "Review the fee page before trading or withdrawing crypto.", href: "/en/fees" }
];

export default function Page() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Support" title="Get help through official TecPey channels" description="Find support paths for account, security, fees, onboarding and general TecPey questions." ctaHref="/en/contact-us" ctaLabel="Contact us" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {cards.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
