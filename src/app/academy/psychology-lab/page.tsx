import type { Metadata } from "next";
import { AcademySimulationWorld } from "@/components/academy/AcademySimulationWorld";
import { ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "شبیه‌ساز آکادمی تک‌پی | تمرین تصمیم‌گیری رمزارز",
  description: "تمرین سناریومحور آکادمی تک‌پی برای مدیریت ریسک، روانشناسی بازار، سبد دارایی و تصمیم‌گیری مسئولانه.",
  alternates: { canonical: "https://tecpey.ir/academy/psychology-lab" },
};

export default function PsychologyLabPage() {
  return <ContentShell><AcademySimulationWorld locale="fa" focus="psychology" /></ContentShell>;
}
