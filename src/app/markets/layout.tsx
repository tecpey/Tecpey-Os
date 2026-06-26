import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "مارکت برد آنلاین | قیمت لحظه‌ای بیت‌کوین، تتر و ارز دیجیتال",
  description:
    "مارکت برد آنلاین تک‌پی برای مشاهده قیمت لحظه‌ای رمزارزها، جست‌وجو، مقایسه بازارها و بررسی بیت‌کوین، تتر، اتریوم و سایر ارزهای دیجیتال.",
  keywords: [
    "قیمت بیت کوین",
    "قیمت تتر",
    "قیمت ارز دیجیتال",
    "بازار رمزارز",
    "مارکت برد رمزارز",
    "قیمت اتریوم",
    "قیمت لحظه‌ای رمزارز",
    "خرید رمزارز",
  ],
  alternates: {
    canonical: "https://tecpey.ir/markets",
    languages: {
      "fa-IR": "https://tecpey.ir/markets",
      "en-US": "https://tecpey.ir/en/markets",
      "x-default": "https://tecpey.ir/markets",
    },
  },
  openGraph: {
    title: "مارکت برد آنلاین تک‌پی",
    description: "قیمت لحظه‌ای رمزارزها، جست‌وجو و مقایسه بازارها قبل از معامله.",
    url: "https://tecpey.ir/markets",
    siteName: "TecPey",
    locale: "fa_IR",
    type: "website",
    images: [{ url: "/images/tecpey-logo.png", width: 512, height: 512, alt: "TecPey" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "مارکت برد آنلاین تک‌پی",
    description: "قیمت لحظه‌ای رمزارزها، جست‌وجو و مقایسه بازارها قبل از معامله.",
    images: ["/images/tecpey-logo.png"],
  },
};

export default function MarketsLayout({ children }: { children: ReactNode }) {
  return children;
}
