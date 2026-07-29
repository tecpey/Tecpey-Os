import type { Metadata } from "next";
import { AcademyMentorCoachCenter } from "@/components/academy/AcademyMentorCoachCenter";

export const metadata: Metadata = {
  title: "مربی شخصی آکادمی تک‌پی | حافظه آموزشی و مسیر پیشنهادی",
  description: "مرکز مربی شخصی آکادمی تک‌پی برای تحلیل پیشرفت، ضعف‌های آموزشی، حالت پاسخ‌گویی Mentor و پیشنهاد مسیر یادگیری بعدی.",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://tecpey.ir/academy/mentor-coach" },
};

export default function AcademyMentorCoachPage() {
  return <AcademyMentorCoachCenter locale="fa" />;
}
