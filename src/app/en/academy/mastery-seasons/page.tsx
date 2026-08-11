import type { Metadata } from "next";
import { AcademyMasterySeasonsShowcase } from "@/components/academy/AcademyMasterySeasonsShowcase";
import { EnglishShell } from "@/app/en/components/EnglishUI";
import { ArticleSchema } from "@/components/seo/ArticleSchema";

export const metadata: Metadata = {
  title: "TecPey Academy Mastery Seasons | Infinite learning path",
  description: "Personalized Academy seasons for weak-area repair, market updates, Trading Arena discipline and healthy peer-level learning competition.",
  alternates: { canonical: "https://tecpey.ir/en/academy/mastery-seasons" },
};

export default function EnglishAcademyMasterySeasonsPage() {
  return (
    <EnglishShell>
      <ArticleSchema
        headline="TecPey Academy Mastery Seasons"
        description="An infinite learning path after the 7 core Academy terms."
        url="https://tecpey.ir/en/academy/mastery-seasons"
        language="en"
      />
      <AcademyMasterySeasonsShowcase locale="en" />
    </EnglishShell>
  );
}

