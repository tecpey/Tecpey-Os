import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "TecPey Fees | Transparent crypto trading costs",
  description: "Understand TecPey trading fees, withdrawal costs, network fees and transparent fee communication before trading.",
  path: "/en/fees",
  enPath: "/en/fees",
  locale: "en_US",
  keywords: [
    "crypto exchange fees",
    "bitcoin trading fees",
    "usdt withdrawal fee",
    "crypto trading costs",
    "transparent crypto fees",
    "TecPey fee structure",
  ],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
