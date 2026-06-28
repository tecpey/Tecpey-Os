import type { Metadata } from "next";
import { PeerJournals } from "@/components/academy/community/PeerJournals";

export const metadata: Metadata = {
  title: "ژورنال‌های مشترک | جامعه تک‌پی",
  description: "بازتاب‌های گمنام یادگیرندگان تک‌پی — اشتراک‌گذاری اختیاری، بدون اطلاعات شخصی",
  alternates: { canonical: "https://tecpey.ir/academy/community/journals" },
};

export default function JournalsPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <PeerJournals />
      </div>
    </div>
  );
}
