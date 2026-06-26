import { ArticleSchema } from "@/components/seo/ArticleSchema";
import type { Metadata } from "next";
import { EnglishShell, EnglishHero, EnglishCard } from "../components/EnglishUI";
import { StructuredData, breadcrumbSchema } from "@/components/seo/StructuredData";

export const metadata: Metadata = {
  title: "Crypto exchange comparisons | TecPey",
  description: "Compare crypto exchanges using clearer criteria: fees, security, support, onboarding, education, transparency and user experience.",
  alternates: { canonical: "https://tecpey.ir/en/compare" },
};

const criteria = [
  { title: "Fees and transparency", text: "Compare trading fees, withdrawal costs, network fees and how clearly each platform explains costs before action.", href: "/en/fees" },
  { title: "Account security", text: "Review login protection, verification flow, anti-phishing guidance and how users are guided through safer onboarding.", href: "/en/security" },
  { title: "Support and trust signals", text: "Check official contact channels, response paths, office information and user education before choosing a platform.", href: "/en/contact-us" },
  { title: "User experience", text: "A good exchange should make market review, registration, identity checks and first trades easier to understand.", href: "/en/start-guide" },
];

const comparisons = [
  { slug: "nobitex-vs-tecpey", title: "TecPey vs Nobitex", text: "A practical comparison framework for users evaluating fees, onboarding, security, support and education." },
  { slug: "bitpin-vs-tecpey", title: "TecPey vs Bitpin", text: "Compare important exchange selection criteria before choosing where to start." }
];

const schema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "TecPey crypto exchange comparisons",
  url: "https://tecpey.ir/en/compare",
  inLanguage: "en",
  about: ["Crypto exchange comparison", "Fees", "Security", "Support", "User experience"],
};

export default function ComparePage() {
  return (
    <EnglishShell>
      <ArticleSchema headline="Crypto exchange comparisons" description="Compare crypto exchanges by fees, security, support, transparency and user experience." url="https://tecpey.ir/en/compare" language="en" />
      <StructuredData data={[schema, breadcrumbSchema([{ name: "Home", url: "https://tecpey.ir/en" }, { name: "Compare", url: "https://tecpey.ir/en/compare" }])]} />
      <EnglishHero eyebrow="Exchange comparisons" title="Compare crypto exchanges with clearer criteria" description="Review fees, security, support, onboarding, transparency and educational resources before choosing where to start." ctaHref="/en/compare" ctaLabel="View comparisons" secondaryHref="/en/markets" secondaryLabel="View markets" />
      <section className="px-4 pb-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-4">
          {criteria.map((item) => <EnglishCard key={item.title} title={item.title} text={item.text} href={item.href} />)}
        </div>
      </section>
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2">
          {comparisons.map((item) => <EnglishCard key={item.slug} title={item.title} text={item.text} href={`/en/compare/${item.slug}`} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
