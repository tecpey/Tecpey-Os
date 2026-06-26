
import { ArticleSchema } from "@/components/seo/ArticleSchema";
import type { Metadata } from "next";
import { comparePages } from "@/data/academy";
import { ContentHero, ContentShell } from "@/components/content/ContentUI";
import { TextOnlyCard } from "@/components/tecpey/TextOnlyCard";
import { Scale, ShieldCheck, BadgePercent, Headphones } from "lucide-react";

export const metadata: Metadata = {
  title: "مقایسه صرافی‌ها | تک‌پی با نوبیتکس، بیت‌پین و معیارهای انتخاب",
  description: "صفحات مقایسه‌ای تک‌پی برای کمک به انتخاب آگاهانه صرافی ارز دیجیتال؛ تجربه کاربری، کارمزد، امنیت، آموزش و شفافیت.",
  alternates: { canonical: "https://tecpey.ir/compare" },
  keywords: ["مقایسه صرافی ارز دیجیتال", "تک پی و نوبیتکس", "تک پی و بیت پین", "بهترین صرافی ارز دیجیتال"],
};

export default function CompareIndexPage() {
  return (
    <ContentShell>
      <ArticleSchema headline="مقایسه صرافی‌های رمزارز" description="مقایسه صرافی‌ها بر اساس کارمزد، امنیت، شفافیت، پشتیبانی و تجربه کاربری." url="https://tecpey.ir/compare" language="fa-IR" />
      <ContentHero
        eyebrow="Comparison Pages"
        title="مقایسه صرافی‌ها؛ تصمیم‌گیری حرفه‌ای به‌جای انتخاب احساسی"
        description="قبل از انتخاب صرافی، کارمزد، امنیت، پشتیبانی، مسیر ثبت‌نام و تجربه کاربری را مقایسه کنید تا انتخاب آگاهانه‌تری داشته باشید."
        ctaLabel="مشاهده مقایسه‌ها"
      />
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2">
          {comparePages.map((page, index) => {
            const icons = [Scale, ShieldCheck, BadgePercent, Headphones];
            const Icon = icons[index % icons.length];
            return (
              <TextOnlyCard
                key={page.slug}
                href={`/compare/${page.slug}`}
                title={page.title}
                text={page.description}
                meta={`مقایسه با ${page.competitor}`}
                icon={Icon}
              />
            );
          })}
        </div>
      </section>
    </ContentShell>
  );
}
