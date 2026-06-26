
import type { Metadata } from "next";
import { StructuredData, breadcrumbSchema } from "@/components/seo/StructuredData";
import { globalFaqs } from "@/data/academy";
import { ContentHero, ContentShell, FaqList, TrustStrip } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "سوالات پرتکرار تک‌پی | FAQ خرید تتر، بیت‌کوین، امنیت و کارمزد",
  description: "پایگاه سوالات پرتکرار تک‌پی برای پاسخ به سوالات کاربران درباره رمزارز، خرید تتر، بیت‌کوین، امنیت، کارمزد و شروع معامله.",
  alternates: { canonical: "https://tecpey.ir/faq" },
  keywords: ["سوالات پرتکرار تک پی", "FAQ ارز دیجیتال", "خرید تتر", "امنیت صرافی", "کارمزد صرافی"],
};

const safeGlobalFaqs = globalFaqs.filter((item): item is { q: string; a: string } => Boolean(item && "q" in item && "a" in item));

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: safeGlobalFaqs.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function FaqPage() {
  return (
    <ContentShell>
      <StructuredData data={breadcrumbSchema([{ name: "خانه", url: "https://tecpey.ir" }, { name: "سوالات پرتکرار", url: "https://tecpey.ir/faq" }])} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <ContentHero
        eyebrow="سوالات پرتکرار"
        title="سوالات پرتکرار تک‌پی؛ پاسخ‌های کوتاه، دقیق و قابل فهم"
        description="پاسخ‌های کوتاه و روشن به سوالاتی که قبل از ثبت‌نام، خرید تتر، بررسی بیت‌کوین یا شروع معامله برای کاربران تک‌پی پیش می‌آید."
        ctaLabel="مشاهده پاسخ‌ها"
      />
      <TrustStrip />
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <FaqList faqs={safeGlobalFaqs} />
        </div>
      </section>
    </ContentShell>
  );
}
