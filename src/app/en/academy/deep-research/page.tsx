import type { Metadata } from "next";
import { DeepResearchWorkspace } from "@/components/research/DeepResearchWorkspace";
import { EnglishShell } from "../../components/EnglishUI";

export const metadata: Metadata = {
  title: "Deep Research | TecPey",
  description: "TecPey Deep Research workspace with claim-level citations, source freshness and visible conflicting evidence.",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://tecpey.ir/en/academy/deep-research", languages: { fa: "https://tecpey.ir/academy/deep-research" } },
};

export default function EnglishDeepResearchPage(){ return <EnglishShell><DeepResearchWorkspace locale="en"/></EnglishShell>; }
