import type { Metadata } from "next";
import { ContentShell } from "@/components/content/ContentUI";
import { CommunityCareerPanel } from "@/components/community/CommunityCareerPanel";

export const metadata: Metadata = {
  title: "جامعه آکادمی تک‌پی | هویت عمومی و تالار افتخار",
  description: "جامعه آکادمی تک‌پی برای هویت عمومی، دستاوردها، تالار افتخار و مسیر رشد مسئولانه دانشجویان.",
  alternates: { canonical: "https://tecpey.ir/academy/community" },
};

export default function AcademyCommunityPage() {
  return <ContentShell><main className="min-h-screen px-4 py-12 text-[color:var(--tp-text)] sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><CommunityCareerPanel mode="community" /></div></main></ContentShell>;
}
