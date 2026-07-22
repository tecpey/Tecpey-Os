import type { Metadata } from "next";
import { headers } from "next/headers";
import TecpeyEnterpriseLanding from "@/app/home/enterprise/TecpeyEnterpriseLanding";

const homeTitle = "تک‌پی | آموزش رمزارز، تریدینگ آرنا و منتور هوشمند";
const homeDescription =
  "تک‌پی پلتفرم آموزش رمزارز، تمرین معاملاتی با سرمایه مجازی، منتور هوشمند و یادگیری امنیت و مدیریت ریسک است؛ خدمات مالی تنها پس از فعال‌سازی و تأیید عملیاتی ارائه می‌شوند.";

export const metadata: Metadata = {
  metadataBase: new URL("https://tecpey.ir"),
  title: homeTitle,
  description: homeDescription,
  keywords: [
    "تک‌پی",
    "TecPey",
    "آموزش رمزارز",
    "آکادمی ارز دیجیتال",
    "تریدینگ آرنا",
    "تمرین معامله با سرمایه مجازی",
    "منتور هوشمند مالی",
    "آموزش تحلیل تکنیکال",
    "آموزش تحلیل فاندامنتال",
    "مدیریت ریسک در ترید",
    "امنیت رمزارز",
    "سواد مالی دیجیتال",
    "ورود مسئولانه به بازار رمزارز",
  ],
  alternates: {
    canonical: "https://tecpey.ir",
    languages: {
      "fa-IR": "https://tecpey.ir",
      "en-US": "https://tecpey.ir/en",
    },
  },
  openGraph: {
    title: homeTitle,
    description: homeDescription,
    url: "https://tecpey.ir",
    siteName: "TecPey",
    locale: "fa_IR",
    type: "website",
    images: [
      {
        url: "/images/tecpey-logo.png",
        width: 512,
        height: 512,
        alt: "TecPey financial education and virtual trading practice",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: homeTitle,
    description: homeDescription,
    images: ["/images/tecpey-logo.png"],
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
      name: "آکادمی رمزارز",
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
  inLanguage: ["fa-IR", "en-US"],
  potentialAction: {
    "@type": "SearchAction",
    target: "https://tecpey.ir/academy?search={search_term_string}",
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
        text: "تک‌پی یک پلتفرم آموزش رمزارز، تمرین معاملاتی با سرمایه مجازی و منتور هوشمند است که امنیت، مدیریت ریسک و تصمیم‌گیری مسئولانه را در اولویت قرار می‌دهد.",
      },
    },
    {
      "@type": "Question",
      name: "تریدینگ آرنا تک‌پی چه کاربردی دارد؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "تریدینگ آرنا محیط تمرین آموزشی با سرمایه مجازی و وضعیت سرورمحور است تا کاربر بدون استفاده از سرمایه واقعی، مدیریت ریسک و انضباط معاملاتی را تمرین کند.",
      },
    },
    {
      "@type": "Question",
      name: "آیا خدمات مالی واقعی در تک‌پی فعال است؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "هر خدمت مالی واقعی فقط پس از تکمیل الزامات فنی، امنیتی، عملیاتی و قانونی همان خدمت فعال می‌شود. صفحات عمومی نباید فعال‌بودن خدمت تأییدنشده را القا کنند.",
      },
    },
    {
      "@type": "Question",
      name: "منتور هوشمند تک‌پی چگونه فعال می‌شود؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "کاربر عمومی ابتدا ورودی آموزشی و مسیر ساخت پروفایل را می‌بیند. منتور شخصی فقط پس از آماده‌شدن پروفایل رسمی آکادمی و در محدوده داده‌های مجاز کاربر فعال می‌شود.",
      },
    },
  ],
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "راهنمای ورود مسئولانه به بازار رمزارز با آموزش و تمرین مجازی",
  description: homeDescription,
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
    "آموزش رمزارز",
    "تریدینگ آرنا",
    "مدیریت ریسک",
    "امنیت حساب",
    "تمرین معامله با سرمایه مجازی",
  ],
  mainEntityOfPage: "https://tecpey.ir",
};

export default async function Home() {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;

  return (
    <>
      {[faqSchema, breadcrumbSchema, websiteSchema, articleSchema].map(
        (schema, index) => (
          <script
            key={index}
            nonce={nonce}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ),
      )}
      <TecpeyEnterpriseLanding />
    </>
  );
}
