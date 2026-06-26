import type { Metadata } from "next";
import { CryptoNewsCenter } from "@/components/home/TecpeyHomeAI";
import { EnglishShell } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Crypto News | TecPey AI News Center",
  description: "Dynamic crypto news with educational summaries, market impact and links to TecPey Academy and AI Mentor.",
  alternates: { canonical: "https://tecpey.ir/en/crypto-news" },
};

export default function EnglishCryptoNewsPage() {
  return (
    <EnglishShell>
      <main className="min-h-screen bg-[color:var(--tp-bg)] pt-28">
        <CryptoNewsCenter locale="en" />
      </main>
    </EnglishShell>
  );
}
