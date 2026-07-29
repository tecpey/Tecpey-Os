import type { Metadata } from "next";
import { ContentShell } from "@/components/content/ContentUI";
import { CommunityCareerPanel } from "@/components/community/CommunityCareerPanel";
import { CommunityHub } from "@/components/academy/community/CommunityHub";

export const metadata: Metadata = {
  title: "جامعه آکادمی تک‌پی | یادگیری اجتماعی",
  description: "جامعه آکادمی تک‌پی — لیدربورد انضباط، چالش‌های هفتگی، گروه‌های مطالعاتی، حریم‌خصوصی‌محور.",
  alternates: { canonical: "https://tecpey.ir/academy/community" },
};

export default function AcademyCommunityPage() {
  return (
    <ContentShell>
      <main className="min-h-screen px-4 py-12 text-[color:var(--tp-text)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <CommunityCareerPanel mode="community" />
          <div className="mt-12 max-w-2xl mx-auto">
            <CommunityHub />
          </div>
        </div>
      </main>
    </ContentShell>
  );
}
