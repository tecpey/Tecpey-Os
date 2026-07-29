import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "مرکز امنیت تک‌پی | امنیت حساب و دارایی رمزارزی",
  description: "مرکز امنیت تک‌پی؛ آموزش رمز عبور امن، مراقبت از کد تایید، جلوگیری از فیشینگ و نکات مهم انتقال رمزارز.",
  path: "/security",
  enPath: "/en/security",
  keywords: [
    "امنیت رمزارز",
    "امنیت کیف پول",
    "جلوگیری از فیشینگ",
    "امنیت حساب ارز دیجیتال",
    "مرکز امنیت تک‌پی",
    "حفاظت دارایی دیجیتال",
    "رمز عبور امن",
  ],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
