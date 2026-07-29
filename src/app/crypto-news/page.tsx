import type { Metadata } from "next";
import { CryptoNewsCenter } from "@/components/home/TecpeyHomeAI";

export const metadata: Metadata = {
  title: "اخبار رمزارز | مرکز خبر هوشمند تک‌پی",
  description: "آخرین اخبار بازار رمزارز با خلاصه آموزشی، تحلیل اثر بازار و اتصال به آکادمی و مربی هوشمند تک‌پی.",
  alternates: { canonical: "https://tecpey.ir/crypto-news" },
};

export default function CryptoNewsPage() {
  return (
    <main className="min-h-screen bg-[color:var(--tp-bg)] pt-28">
      <CryptoNewsCenter locale="fa" />
    </main>
  );
}
