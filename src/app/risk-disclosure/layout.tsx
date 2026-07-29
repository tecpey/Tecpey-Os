import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "بیانیه ریسک تک‌پی | ریسک‌های بازار رمزارز",
  description: "بیانیه ریسک تک‌پی درباره نوسان قیمت رمزارز، خطای انتقال، انتخاب شبکه، امنیت حساب و نبود تضمین سود.",
  path: "/risk-disclosure",
  enPath: "/en/risk-disclosure",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
