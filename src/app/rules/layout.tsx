import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "قوانین تک‌پی | شرایط استفاده از خدمات رمزارز",
  description: "قوانین و راهنمای استفاده از تک‌پی برای شروع امن‌تر، شفافیت کارمزد، مدیریت ریسک و مسئولیت‌های کاربر.",
  path: "/rules",
  enPath: "/en/rules",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
