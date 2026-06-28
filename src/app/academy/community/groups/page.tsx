import type { Metadata } from "next";
import { StudyGroups } from "@/components/academy/community/StudyGroups";

export const metadata: Metadata = {
  title: "گروه‌های مطالعاتی | جامعه تک‌پی",
  description: "گروه‌های مطالعاتی تک‌پی — یادگیری گروهی بدون چت و بدون فشار",
  alternates: { canonical: "https://tecpey.ir/academy/community/groups" },
};

export default function GroupsPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <StudyGroups />
      </div>
    </div>
  );
}
