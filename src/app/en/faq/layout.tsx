import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "TecPey FAQ | Crypto exchange questions",
  description: "Short answers to common TecPey questions about registration, security, fees, Tether, Bitcoin and crypto trading.",
  path: "/en/faq",
  enPath: "/en/faq",
  locale: "en_US",
  keywords: [
    "TecPey FAQ",
    "crypto exchange questions",
    "how to buy bitcoin",
    "how to buy usdt",
    "crypto registration",
    "TecPey help",
    "crypto beginners guide",
  ],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
