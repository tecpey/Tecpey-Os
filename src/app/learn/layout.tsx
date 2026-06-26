import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "دانشنامه تک‌پی | مفاهیم رمزارز به زبان ساده",
  description:
    "دانشنامه تک‌پی؛ راهنمای جامع مفاهیم رمزارز، بلاکچین، ترید، کیف پول و امنیت به زبان فارسی — از مبتدی تا حرفه‌ای.",
  path: "/learn",
  keywords: [
    "دانشنامه رمزارز",
    "واژه‌نامه ارز دیجیتال",
    "مفاهیم بلاکچین",
    "آموزش رمزارز",
    "بلاکچین چیست",
    "کیف پول رمزارز",
    "ترید چیست",
    "استیبل کوین",
    "دیفای",
    "تعریف رمزارز",
  ],
});

export default function LearnLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
