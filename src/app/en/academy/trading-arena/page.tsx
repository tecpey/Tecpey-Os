import type { Metadata } from "next";
import { TradingArenaExecutionClient } from "@/components/academy/trading-arena/TradingArenaExecutionClient";
import { EnglishShell } from "../../components/EnglishUI";

export const metadata: Metadata = {
  title: "TecPey Trading Arena | Educational trading practice",
  description:
    "Server-authoritative virtual trading practice with risk controls, journaling and Mentor-connected learning evidence.",
  alternates: { canonical: "https://tecpey.ir/en/academy/trading-arena" },
};

export default function EnglishTradingArenaPage() {
  return (
    <EnglishShell>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.14),transparent_34%),#020617] px-4 py-8 text-white sm:px-6 lg:px-8" dir="ltr">
        <div className="mx-auto max-w-[1500px]">
          <TradingArenaExecutionClient locale="en" />
        </div>
      </main>
    </EnglishShell>
  );
}
