import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "TecPey Rules | User guidance for crypto services",
  description: "TecPey rules and user guidance for safer crypto access, security expectations, transparency and user responsibility.",
  path: "/en/rules",
  enPath: "/en/rules",
  locale: "en_US",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
