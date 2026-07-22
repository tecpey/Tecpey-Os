import "./globals.css";
import "./tecpey-brand-tokens.css";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import Providers from "./providers";
import Navbar from "@/components/navbar/Navbar";
import { getProfileInfo } from "@/services/profile";
import { getMetaData } from "@/services/metaData.services";
import Footer from "@/components/footer/Footer";
import { ThemeProvider } from "@/components/theme-provider";
import HtmlLangDir from "@/components/seo/HtmlLangDir";
import { GlobalAiMentorWidget } from "@/components/academy/GlobalAiMentorWidget";
import { PublicMentorEntry } from "@/components/academy/PublicMentorEntry";
import { buildFAQSchema, TECPEY_FAQS } from "@/lib/seo";
import { REQUEST_ROUTE_CONTEXT_HEADER } from "@/lib/request-route-context";

const globalSeoSchemas = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://tecpey.ir/#organization",
    name: "TecPey",
    alternateName: ["تک‌پی", "TecPey Crypto Exchange"],
    url: "https://tecpey.ir",
    logo: "https://tecpey.ir/images/tecpey-logo.png",
    email: "info@tecpey.ir",
    telephone: "+981132338026",
    sameAs: [
      "https://t.me/tecpeyco",
      "https://instagram.com/tecpeyco",
      "https://discord.gg/tecpeyex"
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: "+981132338026",
        email: "support@tecpey.ir",
        contactType: "customer support",
        areaServed: "IR",
        availableLanguage: ["fa", "en"]
      },
      {
        "@type": "ContactPoint",
        telephone: "+981132338026",
        email: "info@tecpey.ir",
        contactType: "general inquiries",
        areaServed: "IR",
        availableLanguage: ["fa", "en"]
      }
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "خدمات تک‌پی",
      itemListElement: [
        { "@type": "Service", "@id": "https://tecpey.ir/#exchange", name: "TecPey Exchange", alternateName: "صرافی تک‌پی", url: "https://tecpey.ir", serviceType: "Cryptocurrency Exchange", areaServed: "IR" },
        { "@type": "Service", "@id": "https://tecpey.ir/#academy", name: "TecPey Academy", alternateName: "آکادمی تک‌پی", url: "https://tecpey.ir/academy", serviceType: "Cryptocurrency Education" },
        { "@type": "Service", "@id": "https://tecpey.ir/#ai-mentor", name: "TecPey AI Mentor", alternateName: "مربی هوشمند تک‌پی", url: "https://tecpey.ir/academy", serviceType: "AI-powered Learning Mentor" },
        { "@type": "Service", "@id": "https://tecpey.ir/#trading-arena", name: "TecPey Trading Arena", alternateName: "آرنای معاملاتی تک‌پی", url: "https://tecpey.ir/academy", serviceType: "Virtual Trading Practice" },
        { "@type": "Service", "@id": "https://tecpey.ir/#security-center", name: "TecPey Security Center", alternateName: "مرکز امنیت تک‌پی", url: "https://tecpey.ir/security", serviceType: "Crypto Security Education" }
      ]
    }
  },
  {
    "@context": "https://schema.org",
    "@type": "FinancialService",
    "@id": "https://tecpey.ir/#financial-service",
    name: "TecPey",
    url: "https://tecpey.ir",
    logo: "https://tecpey.ir/images/tecpey-logo.png",
    email: "info@tecpey.ir",
    telephone: "+981132338026",
    description: "TecPey is a Persian crypto exchange experience for live crypto prices, cryptocurrency education, security guidance and a clearer start in the Iran crypto market.",
    areaServed: {
      "@type": "Country",
      name: "Iran"
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: "Babol",
      addressRegion: "Mazandaran",
      addressCountry: "IR"
    },
    serviceType: [
      "Cryptocurrency exchange",
      "Persian crypto exchange",
      "Crypto market board",
      "Cryptocurrency education",
      "Crypto glossary",
      "Crypto comparison platform"
    ],
    provider: {
      "@id": "https://tecpey.ir/#organization"
    }
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://tecpey.ir/#website",
    name: "TecPey",
    url: "https://tecpey.ir",
    inLanguage: ["fa-IR", "en-US"],
    publisher: {
      "@id": "https://tecpey.ir/#organization"
    },
    potentialAction: {
      "@type": "SearchAction",
      target: "https://tecpey.ir/markets?search={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  },
  buildFAQSchema(TECPEY_FAQS),
];

export async function generateMetadata() {
  const favicon = "/favicon.ico";

  return {
    metadataBase: new URL("https://tecpey.ir"),
    title: {
      default: "تک‌پی | صرافی رمزارز امن، سریع و شفاف",
      template: "%s | TecPey",
    },
    description:
      "تک‌پی صرافی رمزارز فارسی برای مشاهده قیمت لحظه‌ای، خرید و فروش تتر و بیت‌کوین، آموزش، امنیت حساب و شروع سریع معامله است.",
    keywords: [
      "صرافی ارز دیجیتال",
      "خرید بیت کوین",
      "خرید تتر",
      "قیمت رمزارز",
      "آموزش رمزارز",
      "صرافی رمزارز ایران",
      "امنیت رمزارز",
      "تک‌پی",
    ],
    applicationName: "TecPey",
    manifest: "/site.webmanifest",
    alternates: {
      canonical: "https://tecpey.ir",
      languages: {
        "fa-IR": "https://tecpey.ir",
        "en-US": "https://tecpey.ir/en",
        "x-default": "https://tecpey.ir",
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    icons: {
      icon: favicon,
      shortcut: favicon,
      apple: favicon,
    },
    openGraph: {
      type: "website",
      siteName: "TecPey",
      url: "https://tecpey.ir",
      title: "تک‌پی | صرافی رمزارز امن، سریع و شفاف",
      description:
        "مشاهده قیمت لحظه‌ای رمزارزها، شروع سریع معامله، آموزش، امنیت حساب و پشتیبانی رسمی تک‌پی.",
      locale: "fa_IR",
      alternateLocale: ["en_US"],
      images: [{ url: "https://tecpey.ir/images/tecpey-logo.png", width: 512, height: 512, alt: "TecPey" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "تک‌پی | صرافی رمزارز امن و حرفه‌ای",
      description: "بازار رمزارز را با قیمت لحظه‌ای، امنیت، آموزش و مسیر شروع روشن دنبال کنید.",
      images: ["https://tecpey.ir/images/tecpey-logo.png"],
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get(REQUEST_ROUTE_CONTEXT_HEADER) ?? "/";
  const isEnglishPath = pathname === "/en" || pathname.startsWith("/en/");
  const locale = isEnglishPath ? "en" : "fa";
  const messages = (await import(`../i18n/messages/${locale}.json`)).default;
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const user = await getProfileInfo();
  const metaData = await getMetaData();

  return (
    <html
      lang={isEnglishPath ? "en-US" : "fa-IR"}
      dir={isEnglishPath ? "ltr" : "rtl"}
      suppressHydrationWarning
    >
      <body>
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(globalSeoSchemas) }}
        />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider nonce={nonce}>
            <Providers>
              <HtmlLangDir />
              <Navbar user={user} metaData={metaData} />
              {children}
              <Footer metaData={metaData} />
              <PublicMentorEntry />
              <GlobalAiMentorWidget />
            </Providers>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
