import type { Metadata } from "next";
import { AcademyMasterySeasonsShowcase } from "@/components/academy/AcademyMasterySeasonsShowcase";
import { ContentShell } from "@/components/content/ContentUI";
import { ArticleSchema } from "@/components/seo/ArticleSchema";

export const metadata: Metadata = {
  title: "Mastery Seasons آکادمی تک‌پی | مسیر رشد بی‌پایان",
  description: "Seasonهای اختصاصی آکادمی تک‌پی برای ترمیم ضعف‌ها، آموزش روز، نظم در Trading Arena و رقابت سالم کاربران هم‌سطح.",
  alternates: { canonical: "https://tecpey.ir/academy/mastery-seasons" },
};

export default function AcademyMasterySeasonsPage() {
  return (
    <ContentShell>
      <ArticleSchema
        headline="Mastery Seasons آکادمی تک‌پی"
        description="مسیر رشد بی‌پایان پس از ۷ ترم اصلی آکادمی تک‌پی."
        url="https://tecpey.ir/academy/mastery-seasons"
        language="fa-IR"
      />
      <AcademyMasterySeasonsShowcase locale="fa" />
    </ContentShell>
  );
}

