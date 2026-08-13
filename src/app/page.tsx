import type { Metadata } from "next";
import { headers } from "next/headers";
import TecpeyEnterpriseLanding from "@/app/home/enterprise/TecpeyEnterpriseLanding";
import { getLandingGrowthRadarFromAuthority } from "@/lib/landing-growth-authority";
import { buildLandingGrowthSchemasFromRadar } from "@/lib/landing-growth";
import {
  SITE_URL,
  buildAnswerEntityProfileSchema,
  buildHowToSchema,
  buildWebPageSchema,
} from "@/lib/seo";
import { safeJsonLd } from "@/lib/json-ld";

export const metadata: Metadata = {
  metadataBase: new URL("https://tecpey.ir"),
  title: "تک‌پی، نقطه امن ورود آگاهانه به بازار رمزارز",
  description:
    "تک‌پی مسیر آموزش مالی، مدیریت ریسک، تمرین معاملاتی مجازی و راهنمایی هوشمند برای ورود آگاهانه به بازار رمزارز است.",
  keywords: [
    "تک‌پی",
    "TecPey",
    "آموزش رایگان ارز دیجیتال",
    "آکادمی ارز دیجیتال",
    "تریدینگ آرنا",
    "تمرین معامله مجازی",
    "آموزش تحلیل تکنیکال",
    "آموزش تحلیل فاندامنتال",
    "مدیریت ریسک در ترید",
    "امنیت رمزارز",
    "منتور هوشمند آموزشی",
    "آموزش ارز دیجیتال",
    "پاسخ مستقیم ارز دیجیتال",
    "تمرین بدون ریسک ارز دیجیتال",
    "راهنمای ورود امن به رمزارز",
  ],
  alternates: {
    canonical: "https://tecpey.ir",
  },
  openGraph: {
    title: "تک‌پی، نقطه امن ورود آگاهانه به بازار رمزارز",
    description:
      "آموزش مالی، تمرین معاملاتی بدون ریسک و راهنمایی هوشمند در یک مسیر شفاف.",
    url: "https://tecpey.ir",
    siteName: "TecPey",
    locale: "fa_IR",
    type: "website",
    images: [
      {
        url: "/images/tecpey-og.png",
        width: 1200,
        height: 630,
        alt: "تک‌پی، نقطه امن ورود به بازار رمزارز",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "تک‌پی، نقطه امن ورود آگاهانه به بازار رمزارز",
    description:
      "آموزش، مدیریت ریسک، تمرین مجازی و راهنمایی هوشمند برای شروع آگاهانه.",
    images: ["/images/tecpey-og.png"],
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "خانه",
      item: "https://tecpey.ir",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "آکادمی",
      item: "https://tecpey.ir/academy",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "تریدینگ آرنا",
      item: "https://tecpey.ir/academy/trading-arena",
    },
  ],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "TecPey",
  alternateName: "تک‌پی",
  url: "https://tecpey.ir",
  inLanguage: "fa-IR",
  potentialAction: {
    "@type": "SearchAction",
    target: "https://tecpey.ir/markets?search={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "تک‌پی چیست؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "تک‌پی یک مسیر آموزش مالی و تمرین معاملاتی بدون ریسک است که آکادمی، تریدینگ آرنا و منتور هوشمند آموزشی را به هم متصل می‌کند.",
      },
    },
    {
      "@type": "Question",
      name: "آیا تریدینگ آرنای تک‌پی با پول واقعی کار می‌کند؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "خیر. تریدینگ آرنا برای تمرین آموزشی با سرمایه مجازی طراحی شده است. فعال‌سازی خدمات پول واقعی به تکمیل جداگانه گیت‌های امنیت، عملیات و انطباق وابسته است.",
      },
    },
    {
      "@type": "Question",
      name: "منتور هوشمند تک‌پی چه کاری انجام می‌دهد؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "منتور هوشمند پس از ساخت پروفایل آکادمی می‌تواند از پیشرفت و تمرین‌های مجاز کاربر برای توضیح درس‌ها، مرور اشتباهات و پیشنهاد قدم بعدی یادگیری استفاده کند؛ این ابزار سیگنال خرید و فروش یا وعده سود تضمینی ارائه نمی‌دهد.",
      },
    },
    {
      "@type": "Question",
      name: "آیا نسخه فعلی تک‌پی برای پول واقعی آماده است؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "خیر. نسخه عمومی فعلی بر آموزش و تمرین بدون ریسک تمرکز دارد و قابلیت‌های صرافی و نگه‌داری دارایی واقعی تا تکمیل گیت‌های امنیتی، عملیاتی، حقوقی و انطباقی غیرفعال می‌مانند.",
      },
    },
  ],
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "راهنمای ورود آگاهانه به بازار رمزارز با آموزش و تمرین بدون ریسک",
  inLanguage: "fa-IR",
  author: {
    "@type": "Organization",
    name: "TecPey",
  },
  publisher: {
    "@type": "Organization",
    name: "TecPey",
    logo: {
      "@type": "ImageObject",
      url: "https://tecpey.ir/images/tecpey-logo.png",
    },
  },
  about: [
    "آموزش ارز دیجیتال",
    "مدیریت ریسک",
    "تمرین معامله مجازی",
    "امنیت رمزارز",
  ],
  mainEntityOfPage: "https://tecpey.ir",
};

export default async function Home() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const growthRadar = await getLandingGrowthRadarFromAuthority("fa");
  const landingGrowthSchemas = buildLandingGrowthSchemasFromRadar(growthRadar);
  const answerEngineSchemas = [
    buildWebPageSchema({
      name: "تک‌پی؛ آموزش رمزارز و تمرین معاملاتی بدون ریسک",
      description:
        "تک‌پی به کاربران فارسی‌زبان کمک می‌کند رمزارز را یاد بگیرند، داده‌های بازار را مرور کنند و پیش از ورود جدی، تصمیم‌های خود را بدون ریسک پول واقعی تمرین کنند.",
      url: SITE_URL,
      locale: "fa-IR",
      about: [
        "آموزش ارز دیجیتال",
        "تمرین معامله مجازی",
        "مدیریت ریسک",
        "امنیت رمزارز",
        "منتور هوشمند آموزشی",
      ],
    }),
    buildHowToSchema({
      name: "چگونه با تک‌پی ورود آگاهانه به بازار رمزارز را شروع کنیم؟",
      description:
        "یک مسیر محتاط و آموزشی برای یادگیری مفاهیم رمزارز، مرور داده‌های بازار و تمرین تصمیم پیش از هر فعال‌سازی مالی.",
      url: SITE_URL,
      locale: "fa-IR",
      steps: [
        {
          name: "یادگیری پایه",
          text: "از آکادمی تک‌پی شروع کنید تا بیت‌کوین، تتر، کیف پول، کارمزد، امنیت و ریسک‌های اصلی بازار را بشناسید.",
          url: `${SITE_URL}/academy`,
        },
        {
          name: "مرور داده‌های بازار",
          text: "از مارکت برد و صفحات رمزارزها برای دیدن قیمت، نوسان و زمینه اولیه بازار استفاده کنید.",
          url: `${SITE_URL}/markets`,
        },
        {
          name: "تمرین بدون ریسک",
          text: "در تریدینگ آرنا تصمیم‌های آموزشی را با سرمایه مجازی تمرین کنید؛ هیچ سود یا زیان واقعی ایجاد نمی‌شود.",
          url: `${SITE_URL}/academy/trading-arena`,
        },
        {
          name: "بررسی ریسک",
          text: "قبل از هر تصمیم مالی واقعی، بیانیه ریسک و راهنماهای امنیتی تک‌پی را مطالعه کنید.",
          url: `${SITE_URL}/risk-disclosure`,
        },
      ],
    }),
    buildAnswerEntityProfileSchema(),
  ];

  return (
    <>
      <script
        nonce={nonce}
        suppressHydrationWarning
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqSchema) }}
      />
      <script
        nonce={nonce}
        suppressHydrationWarning
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbSchema) }}
      />
      <script
        nonce={nonce}
        suppressHydrationWarning
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteSchema) }}
      />
      <script
        nonce={nonce}
        suppressHydrationWarning
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(articleSchema) }}
      />
      {landingGrowthSchemas.map((schema, index) => (
        <script
          key={`landing-growth-${index}`}
          nonce={nonce}
          suppressHydrationWarning
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
        />
      ))}
      {answerEngineSchemas.map((schema, index) => (
        <script
          key={`answer-engine-${index}`}
          nonce={nonce}
          suppressHydrationWarning
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
        />
      ))}
      <TecpeyEnterpriseLanding growthRadar={growthRadar} />
    </>
  );
}
