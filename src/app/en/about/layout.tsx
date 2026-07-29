import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "About TecPey | Secure Persian crypto exchange",
  description: "Learn about TecPey, a Persian crypto exchange platform focused on clarity, security, education and transparent market access.",
  path: "/en/about",
  enPath: "/en/about",
  locale: "en_US",
  keywords: [
    "about TecPey",
    "Persian crypto exchange",
    "TecPey company",
    "crypto exchange Iran",
    "TechnoPardakht",
    "secure crypto exchange",
    "TecPey mission",
  ],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
