import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";

export const metadata = pageMetadata({
  title: "Contact TecPey | Official support and office information",
  description: "Official TecPey contact details, support emails, phone numbers, office address and social channels.",
  path: "/en/contact-us",
  enPath: "/en/contact-us",
  locale: "en_US",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
