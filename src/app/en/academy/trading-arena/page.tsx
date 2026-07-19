import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "TecPey Trading Arena | Academy",
  description:
    "TecPey Trading Arena is an educational virtual trading environment connected to risk practice, journaling and Mentor feedback.",
  robots: { index: false, follow: true },
};

export default function EnglishTradingArenaBridgePage() {
  redirect("/academy/trading-arena");
}
