import type { Metadata } from "next";
import EnglishLandingClient from "./EnglishLandingClient";
import { StructuredData, organizationSchema, webSiteSchema, breadcrumbSchema } from "@/components/seo/StructuredData";

export const metadata: Metadata = {
  title: "TecPey | Secure Persian Crypto Exchange",
  description:
    "TecPey helps users review live crypto prices, account security, transparent fees, local support and the first steps of buying and selling crypto.",
  keywords: [
    "crypto exchange",
    "persian crypto exchange",
    "buy bitcoin",
    "buy usdt",
    "cryptocurrency prices",
    "crypto academy",
    "AI trading mentor",
    "secure crypto exchange",
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
    title: "TecPey | Secure Persian Crypto Exchange",
    description:
      "Live crypto prices, secure onboarding, transparent fees, local support and education for safer market access.",
    url: "https://tecpey.ir/en",
    siteName: "TecPey",
    locale: "en_US",
    alternateLocale: ["fa_IR"],
    type: "website",
    images: [{ url: "/images/tecpey-logo.png", width: 512, height: 512, alt: "TecPey" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TecPey | Secure Persian Crypto Exchange",
    description: "A clearer, safer way to review crypto markets and start trading.",
    images: ["/images/tecpey-logo.png"],
  },
};

export default function EnglishLanding() {
  const schema = <StructuredData data={[organizationSchema, webSiteSchema, breadcrumbSchema([{ name: "Home", url: "https://tecpey.ir/en" }])]} />;
  return <EnglishLandingClient schema={schema} />;
}
