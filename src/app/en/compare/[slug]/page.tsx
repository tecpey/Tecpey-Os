import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EnglishShell, EnglishHero, EnglishCard } from "../../components/EnglishUI";

const comparisons = [
  { slug: "nobitex-vs-tecpey", title: "TecPey vs Nobitex", text: "Compare important criteria such as fees, onboarding, security, support and user education before choosing a crypto exchange." },
  { slug: "bitpin-vs-tecpey", title: "TecPey vs Bitpin", text: "A practical comparison framework for users who want to evaluate crypto exchanges more clearly." }
];
const compareMap = new Map(comparisons.map((item) => [item.slug, item]));

export function generateStaticParams() {
  return comparisons.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = compareMap.get(slug);
  if (!item) return { title: "Comparison | TecPey" };
  return { title: `${item.title} | TecPey`, description: item.text, alternates: { canonical: `https://tecpey.ir/en/compare/${slug}` } };
}

export default async function CompareDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = compareMap.get(slug);
  if (!item) return notFound();
  const criteria = [
    { title: "Fees", text: "Compare trading fees, withdrawal costs and network-related charges." },
    { title: "Security", text: "Review account protection, anti-phishing education and official support paths." },
    { title: "Onboarding", text: "A good exchange should help new users understand markets before they trade." },
  ];
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Exchange comparison" title={item.title} description={item.text} ctaHref="/en/start-guide" ctaLabel="Start guide" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {criteria.map((c) => <EnglishCard key={c.title} title={c.title} text={c.text} />)}
        </div>
      </section>
    </EnglishShell>
  );
}
