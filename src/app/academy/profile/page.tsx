import type { Metadata } from "next";
import { AcademyStudentDashboardV2 } from "@/components/academy/AcademyStudentDashboardV2";

export const metadata: Metadata = {
  title: "داشبورد دانشجوی آکادمی تک‌پی | مسیر یادگیری شخصی",
  description: "داشبورد خصوصی آکادمی تک‌پی برای نمایش مسیر ترم‌ها، مرکز هوشمند، منتور، شبیه‌ساز و مدارک.",
  robots: { index: false, follow: false },
};

export default function AcademyProfilePage() {
  return <AcademyStudentDashboardV2 locale="fa" />;
}
