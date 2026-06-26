import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "آکادمی تک‌پی | آموزش رمزارز با بیان ساده",
  description: "آکادمی تک‌پی؛ آموزش متنی، ساده و معتبر درباره بیت‌کوین، تتر، امنیت، کیف پول، کارمزد و مدیریت ریسک.",
  path: "/academy",
  enPath: "/en/academy",
  keywords: [
    "آموزش ارز دیجیتال",
    "آکادمی رمزارز",
    "آموزش ترید",
    "آموزش بیت کوین",
    "آکادمی تک‌پی",
    "دوره رمزارز رایگان",
    "مربی هوشمند کریپتو",
    "آرنای معاملاتی",
    "تمرین ترید",
    "آموزش مدیریت ریسک",
  ],
});

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
