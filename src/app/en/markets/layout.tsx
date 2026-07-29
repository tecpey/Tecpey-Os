import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "TecPey Markets | Online crypto market board",
  description: "View major crypto markets, live market board information and review key assets before trading.",
  path: "/en/markets",
  enPath: "/en/markets",
  locale: "en_US",
  keywords: [
    "cryptocurrency prices",
    "live crypto prices",
    "bitcoin price",
    "usdt price",
    "crypto market board",
    "ethereum price",
    "crypto price tracker",
  ],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
