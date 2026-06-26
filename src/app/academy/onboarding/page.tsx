import type { Metadata } from "next";
import { AcademyOnboardingClient } from "@/components/academy/AcademyOnboardingClient";

export const metadata: Metadata = {
  title: "ساخت پروفایل آکادمی تک‌پی | شروع مسیر یادگیری",
  description: "ساخت نام نمایشی، نام کاربری و هویت آموزشی برای ورود به ترم‌های آکادمی تک‌پی.",
  robots: { index: false, follow: false },
};

export default function AcademyOnboardingPage() {
  return <AcademyOnboardingClient locale="fa" />;
}
