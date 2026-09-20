import type { Metadata } from "next";
import { JournalView } from "@/components/academy/trading-arena/JournalView";
import { EnglishShell } from "../../../components/EnglishUI";

export const metadata: Metadata = {
  title: "Trading Journal | TecPey Academy",
  description:
    "Review server-authoritative positions, orders, closed trades and behavioural evidence from the TecPey Trading Arena.",
  alternates: { canonical: "https://tecpey.ir/en/academy/trading-arena/journal" },
};

export default function EnglishJournalPage() {
  return (
    <EnglishShell>
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8" dir="ltr">
        <div className="mx-auto max-w-5xl">
          <JournalView locale="en" />
        </div>
      </main>
    </EnglishShell>
  );
}
