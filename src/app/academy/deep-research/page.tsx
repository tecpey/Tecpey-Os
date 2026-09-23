import type { Metadata } from "next";
import { DeepResearchWorkspace } from "@/components/research/DeepResearchWorkspace";

export const metadata: Metadata = {
  title: "پژوهش عمیق | تک‌پی",
  description: "فضای پژوهش عمیق تک‌پی با استناد در سطح ادعا، تازگی منبع و نمایش شفاف شواهد متعارض.",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://tecpey.ir/academy/deep-research", languages: { en: "https://tecpey.ir/en/academy/deep-research" } },
};

export default function DeepResearchPage(){ return <DeepResearchWorkspace locale="fa"/>; }
