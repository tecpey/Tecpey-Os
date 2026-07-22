import "./globals.css";
import "./tecpey-brand-tokens.css";
import { NextIntlClientProvider } from "next-intl";
import { headers } from "next/headers";
import { connection } from "next/server";
import type { ReactNode } from "react";
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
    alternateName: ["تک‌پی", "TecPey OS"],
    url: "https://tecpey.ir",
    logo: "https://tecpey.ir/images/tecpey-logo.png",
    email: "info@tecpey.ir",
    telephone: "+981132338026",
    sameAs: [
      "https://t.me/tecpeyco",
      "https://instagram.com/tecpeyco",
      "https://discord.gg/tecpeyex",
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: "+981132338026",
        email: "support@tecpey.ir",
        contactType: "customer support",
        areaServed: "IR",
        availableLanguage: ["fa", "en"],
      },
      {
        "@type": "ContactPoint",
        telephone: "+981132338026",
        email: "info@tecpey.ir",
        contactType: "general inquiries",
        areaServed: "IR",
        availableLanguage: ["fa", "en"],
      },
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "آموزش و تمرین مالی تک‌پی",
      itemListElement: [
        {
          "@type": "Service",
          "@id": "https://tecpey.ir/#academy",
          name: "TecPey Academy",
          alternateName: "آکادمی تک‌پی",
          url: "https://tecpey.ir/academy",
          serviceType: "Cryptocurrency and financial education",
        },
        {
          "@type": "Service",
          "@id": "https://tecpey.ir/#trading-arena",
          name: "TecPey Trading Arena",
          alternateName: "تریدینگ آرنای تک‌پی",
          url: "https://tecpey.ir/academy/trading-arena",
          serviceType: "Virtual trading practice",
        },
        {
          "@type": "Service",
          "@id": "https://tecpey.ir/#ai-mentor",
          name: "TecPey AI Learning Mentor",
          alternateName: "منتور هوشمند آموزشی تک‌پی",
          url: "https://tecpey.ir/academy",
          serviceType: "AI-assisted learning guidance",
        },
        {
          "@type": "Service",
          "@id": "https://tecpey.ir/#exchange-core",
          name: "TecPey Exchange Core — launch gated",
          alternateName: "هسته صرافی تک‌پی — غیرفعال تا تکمیل گیت‌های راه‌اندازی",
          url: "https://tecpey.ir",
          serviceType: "Launch-gated digital asset infrastructure",
        },
      ],
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "@id": "https://tecpey.ir/#education-platform",
    name: "TecPey",
    url: "https://tecpey.ir",
    logo: "https://tecpey.ir/images/tecpey-logo.png",
    email: "info@tecpey.ir",
    telephone: "+981132338026",
    description:
      "TecPey combines structured financial education, virtual trading practice and governed AI learning guidance. Real-money exchange and custody capabilities remain launch-gated until their operational, compliance and security requirements are complete.",
    areaServed: {
      "@type": "Country",
      name: "Iran",
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: "Babol",
      addressRegion: "Mazandaran",
      addressCountry: "IR",
    },
    provider: {
      "@id": "https://tecpey.ir/#organization",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://tecpey.ir/#website",
    name: "TecPey",
    url: "https://tecpey.ir",
    inLanguage: ["fa-IR", "en-US"],
    publisher: {
      "@id": "https://tecpey.ir/#organization",
    },
    potentialAction: {
      "@type": "SearchAction",
      target: "https://tecpey.ir/markets?search={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  },
  buildFAQSchema(TECPEY_FAQS),
];

export async function generateMetadata() {
  const favicon = "/favicon.ico";

  return {
    metadataBase: new URL("https://tecpey.ir"),
    title: {
      default: "تک‌پی | آموزش مالی، تمرین معاملاتی و ورود آگاهانه",
      template: "%s | TecPey",
    },
    description:
      "تک‌پی مسیر آموزش مالی، تمرین بدون ریسک در تریدینگ آرنا، منتور هوشمند آموزشی و آمادگی آگاهانه برای بازار دارایی‌های دیجیتال است.",
    keywords: [
      "آموزش رمزارز",
      "آموزش مالی",
      "تریدینگ آرنا",
      "تمرین معامله مجازی",
      "مدیریت ریسک",
      "امنیت رمزارز",
      "منتور هوشمند آموزشی",
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
      title: "تک‌پی | آموزش مالی و تمرین معاملاتی بدون ریسک",
      description:
        "آکادمی، تریدینگ آرنای مجازی و منتور هوشمند آموزشی در یک مسیر شفاف و مدیریت‌شده.",
      locale: "fa_IR",
      alternateLocale: ["en_US"],
      images: [
        {
          url: "https://tecpey.ir/images/tecpey-logo.png",
          width: 512,
          height: 512,
          alt: "TecPey",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "تک‌پی | آموزش مالی و تمرین معاملاتی بدون ریسک",
      description:
        "آموزش، مدیریت ریسک، تمرین مجازی و راهنمایی هوشمند برای ورود آگاهانه به بازار.",
      images: ["https://tecpey.ir/images/tecpey-logo.png"],
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Nonce-based CSP requires request-time rendering so Next.js can copy the
  // request nonce onto framework, hydration and inline runtime scripts.
  await connection();

  const requestHeaders = await headers();
  const requestPath = requestHeaders.get(REQUEST_ROUTE_CONTEXT_HEADER) ?? "/";
  const isEnglish = requestPath === "/en" || requestPath.startsWith("/en/");
  const locale = isEnglish ? "en" : "fa";
  const messages = (await import(`../i18n/messages/${locale}.json`)).default;
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const user = await getProfileInfo();
  const metaData = await getMetaData();

  return (
    <html
      lang={isEnglish ? "en-US" : "fa-IR"}
      dir={isEnglish ? "ltr" : "rtl"}
      suppressHydrationWarning
    >
      <body>
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(globalSeoSchemas) }}
        />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
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
