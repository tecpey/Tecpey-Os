import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "TecPey Security Center | Account and asset protection",
  description: "Learn how TecPey approaches account protection, anti-phishing awareness and safer crypto onboarding.",
  path: "/en/security",
  enPath: "/en/security",
  locale: "en_US",
  keywords: [
    "crypto security",
    "crypto account protection",
    "phishing prevention crypto",
    "wallet security",
    "crypto risk management",
    "secure crypto exchange",
    "crypto safety tips",
  ],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
