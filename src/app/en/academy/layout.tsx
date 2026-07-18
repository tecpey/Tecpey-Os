import type { ReactNode } from "react";
import { pageMetadata } from "@/components/seo/metadata";
import AcademyStateBootstrap from "@/components/academy/AcademyStateBootstrap";

export const metadata = pageMetadata({
  title: "TecPey Academy | Learn crypto in English",
  description: "English crypto education from TecPey: Bitcoin, USDT, security, wallets, fees, risk management and trading basics.",
  path: "/en/academy",
  enPath: "/en/academy",
  locale: "en_US",
  keywords: [
    "crypto academy",
    "learn crypto online",
    "crypto education platform",
    "bitcoin tutorial",
    "cryptocurrency course",
    "AI trading mentor",
    "trading simulator",
    "crypto risk management",
  ],
});

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <AcademyStateBootstrap locale="en" />
      {children}
    </>
  );
}
