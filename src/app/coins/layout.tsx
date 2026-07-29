import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "راهنمای رمزارزها | خرید بیت‌کوین، تتر، تون‌کوین و ارز دیجیتال",
  description:
    "راهنمای رمزارزهای تک‌پی برای آشنایی با بیت‌کوین، تتر، اتریوم، تون‌کوین، سولانا، شبکه انتقال، ریسک‌ها و نکات مهم قبل از خرید.",
  alternates: {
    canonical: "https://tecpey.ir/coins",
    languages: {
      "fa-IR": "https://tecpey.ir/coins",
      en: "https://tecpey.ir/en/coins",
      "x-default": "https://tecpey.ir/coins",
    },
  },
};

export default function CoinsLayout({ children }: { children: ReactNode }) {
  return children;
}
