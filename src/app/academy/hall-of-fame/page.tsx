import type { Metadata } from "next";
import { ContentShell } from "@/components/content/ContentUI";
import { CommunityCareerPanel } from "@/components/community/CommunityCareerPanel";

export const metadata: Metadata = {
  title: "تالار افتخار آکادمی تک‌پی",
  description: "رتبه و هویت عمومی دانشجویان آکادمی تک‌پی بر پایه داده رسمی، دستاوردها و مسیر یادگیری مسئولانه.",
  alternates: { canonical: "https://tecpey.ir/academy/hall-of-fame" },
};

export default function HallOfFamePage() {
  return <ContentShell><main className="min-h-screen px-4 py-12 text-[color:var(--tp-text)] sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><CommunityCareerPanel mode="community" /></div></main></ContentShell>;
}
