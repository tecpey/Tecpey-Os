import type { Metadata } from "next";
import { ContentShell } from "@/components/content/ContentUI";
import { AcademySpecializedProgram } from "@/components/academy/AcademySpecializedProgram";

export const metadata: Metadata = {
  title: "دوره تخصصی آکادمی تک‌پی | ثبت درخواست بررسی",
  description: "دعوت به دوره تخصصی حضوری یا آنلاین آکادمی تک‌پی پس از تکمیل مسیر پایه، ارزیابی نهایی و تمرین‌های سناریویی.",
  alternates: { canonical: "https://tecpey.ir/academy/specialized-program" },
};

export default function SpecializedProgramPage() {
  return <ContentShell><AcademySpecializedProgram locale="fa" /></ContentShell>;
}
