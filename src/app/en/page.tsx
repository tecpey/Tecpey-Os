import type { Metadata } from "next";
import EnglishLandingClient from "./EnglishLandingClient";
import { StructuredData, organizationSchema, webSiteSchema, breadcrumbSchema } from "@/components/seo/StructuredData";

export const metadata: Metadata = {
  title: "TecPey | Crypto Education and Launch-Gated Market Practice",
  description:
    "TecPey helps users learn crypto concepts, review market data and practice decisions while real-money exchange, custody, deposits and withdrawals remain launch-gated.",
  keywords: [
    "crypto education",
    "Persian crypto education",
    "virtual trading practice",
    "cryptocurrency market learning",
    "crypto academy",
    "AI learning mentor",
    "crypto security education",
    "crypto education platform",
  ],
  alternates: {
    canonical: "https://tecpey.ir/en",
    languages: {
      "fa-IR": "https://tecpey.ir",
      "en-US": "https://tecpey.ir/en",
      "x-default": "https://tecpey.ir",
    },
  },
  openGraph: {
    title: "TecPey | Crypto Education and Launch-Gated Market Practice",
    description:
      "Crypto education, market-data review and virtual practice while real-money exchange and custody remain launch-gated.",
    url: "https://tecpey.ir/en",
    siteName: "TecPey",
    locale: "en_US",
    alternateLocale: ["fa_IR"],
    type: "website",
    images: [{ url: "/images/tecpey-logo.png", width: 512, height: 512, alt: "TecPey" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TecPey | Crypto Education and Launch-Gated Market Practice",
    description: "A clearer, safer way to learn crypto markets and practice decisions before any launch-gated financial activation.",
    images: ["/images/tecpey-logo.png"],
  },
};

export default function EnglishLanding() {
  const schema = <StructuredData data={[organizationSchema, webSiteSchema, breadcrumbSchema([{ name: "Home", url: "https://tecpey.ir/en" }])]} />;
  return <EnglishLandingClient schema={schema} />;
}
