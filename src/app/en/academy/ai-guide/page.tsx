import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AiMentorExperience } from "@/components/academy/AiMentorExperience";
import { EnglishShell } from "../../components/EnglishUI";

export const metadata: Metadata = {
  title: "TecPey AI Mentor | Personal learning and research workspace",
  description:
    "A dedicated TecPey AI Mentor workspace for learning conversations, progress memory, risk-aware guidance and source-backed public research—never financial signals.",
  alternates: {
    canonical: "https://tecpey.ir/en/academy/ai-guide",
    languages: {
      "fa-IR": "https://tecpey.ir/academy/ai-guide",
      en: "https://tecpey.ir/en/academy/ai-guide",
    },
  },
};

export default function EnglishAiGuidePage() {
  return (
    <EnglishShell>
      <section className="px-3 pb-16 pt-24 sm:px-5 lg:px-7">
        <div className="mx-auto max-w-[1600px]">
          <Link
            href="/en/academy"
            className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-xs font-black text-cyan-300 outline-none transition-[color,background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[.98] focus-visible:ring-2 focus-visible:ring-cyan-300 motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-cyan-300/10 [@media(hover:hover)_and_(pointer:fine)]:hover:text-cyan-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Academy
          </Link>
          <AiMentorExperience locale="en-US" plan="free" />
        </div>
      </section>
    </EnglishShell>
  );
}
