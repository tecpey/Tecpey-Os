import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "درباره تک‌پی | صرافی رمزارز امن و شفاف",
  description: "درباره تک‌پی؛ مسیر ساخت یک تجربه امن، شفاف و حرفه‌ای برای مشاهده بازار رمزارز، آموزش، پشتیبانی و شروع معامله.",
  path: "/about",
  enPath: "/en/about",
  keywords: [
    "درباره تک‌پی",
    "صرافی ارز دیجیتال ایرانی",
    "تک‌پی کیست",
    "صرافی شفاف",
    "صرافی بومی مازندران",
    "تکنوپرداخت",
  ],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
