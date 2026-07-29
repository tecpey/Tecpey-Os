import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "TecPey Coin Guides | Bitcoin, Tether and crypto assets",
  description: "English guides for Bitcoin, Tether, Ethereum, Toncoin, Solana and other crypto assets: use cases, risks and key checks.",
  path: "/en/coins",
  enPath: "/en/coins",
  locale: "en_US",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
