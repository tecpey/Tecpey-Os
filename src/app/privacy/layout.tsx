import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "حریم خصوصی تک‌پی | حفاظت از اطلاعات کاربران",
  description: "اصول حریم خصوصی تک‌پی درباره حفاظت از اطلاعات کاربران، ارتباط رسمی، امنیت حساب و شفافیت داده‌ها.",
  path: "/privacy",
  enPath: "/en/privacy",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
