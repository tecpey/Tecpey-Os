import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "کارمزدهای تک‌پی | شفافیت هزینه خرید و فروش رمزارز",
  description: "راهنمای کارمزدهای تک‌پی؛ آشنایی با هزینه معامله، برداشت، کارمزد شبکه و نکات مهم قبل از ثبت سفارش.",
  path: "/fees",
  enPath: "/en/fees",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
