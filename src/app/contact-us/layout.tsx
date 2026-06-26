import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "تماس با تک‌پی | پشتیبانی رسمی TecPey",
  description: "راه‌های ارتباط رسمی تک‌پی؛ آدرس دفتر بابل، شماره تماس، ایمیل پشتیبانی، تلگرام، اینستاگرام و دیسکورد رسمی.",
  path: "/contact-us",
  enPath: "/en/contact-us",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
