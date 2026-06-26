import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "TecPey Risk Disclosure | Crypto market risks",
  description: "Important crypto market risks including price volatility, transfer mistakes, network selection and account security.",
  path: "/en/risk-disclosure",
  enPath: "/en/risk-disclosure",
  locale: "en_US",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
