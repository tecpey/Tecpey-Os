import type { Metadata } from "next";
import { AchievementCenter } from "@/components/learning-os/AchievementCenter";

export const metadata: Metadata = {
  title: "دستاوردهای آکادمی تک‌پی | Achievement OS",
  description: "نشان‌ها، XP و دستاوردهای رسمی آکادمی تک‌پی بر اساس رویدادهای معتبر یادگیری، منتور، شبیه‌ساز و مدرک.",
  robots: { index: false, follow: false },
};

export default function AchievementsPage() {
  return <AchievementCenter locale="fa" />;
}
