import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "سوالات پرتکرار تک‌پی | پاسخ قبل از خرید رمزارز",
  description: "پاسخ به سوالات پرتکرار درباره ثبت‌نام، امنیت، خرید تتر، بیت‌کوین، کارمزدها و شروع معامله در تک‌پی.",
  path: "/faq",
  enPath: "/en/faq",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
