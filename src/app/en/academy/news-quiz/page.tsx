import type { Metadata } from "next";
import { NewsQuizBoard } from "@/components/academy/NewsQuizBoard";
import { EnglishShell } from "../../components/EnglishUI";

export const metadata: Metadata = {
  title: "TecPey Academy Smart News Quiz | Risk-first practice from today’s crypto news",
  description:
    "TecPey’s smart quiz turns today’s real crypto-market headlines into risk-first, educational questions — with profit promises and price predictions filtered out.",
  alternates: { canonical: "https://tecpey.ir/en/academy/news-quiz" },
};

export default function EnglishNewsQuizPage() {
  return (
    <EnglishShell>
      <main className="py-12">
        <NewsQuizBoard locale="en" />
      </main>
    </EnglishShell>
  );
}
