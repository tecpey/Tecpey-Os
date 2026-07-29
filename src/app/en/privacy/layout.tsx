import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "TecPey Privacy | User data and account communication",
  description: "TecPey privacy principles for user data, official communication and responsible account-related information.",
  path: "/en/privacy",
  enPath: "/en/privacy",
  locale: "en_US",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
