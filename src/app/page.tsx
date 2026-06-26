import type { Metadata } from "next";
import TecpeyEnterpriseLanding from "@/app/home/enterprise/TecpeyEnterpriseLanding";
import { StructuredData, webSiteSchema } from "@/components/seo/StructuredData";

export const metadata: Metadata = {
  metadataBase: new URL("https://tecpey.ir"),
  title: "تک‌پی، نقطه امن ورود به بازار رمزارز",
  description:
    "تک‌پی، نقطه امن ورود به بازار رمزارز؛ مسیر شفاف برای مشاهده بازار رمزارز، آموزش، ارزیابی، امنیت حساب و ورود حرفه‌ای به بازار.",
  keywords: [
    "تک‌پی",
    "TecPey",
    "صرافی ارز دیجیتال",
    "خرید بیت کوین",
    "خرید تتر",
    "قیمت ارز دیجیتال",
    "معامله رمزارز",
    "صرافی رمزارز ایرانی",
    "بهترین صرافی ارز دیجیتال",
    "خرید تتر در ایران",
    "قیمت لحظه‌ای ارز دیجیتال",
    "آموزش رایگان ارز دیجیتال",
    "آکادمی رایگان ارز دیجیتال",
    "آموزش تحلیل تکنیکال",
    "آموزش تحلیل فاندامنتال",
    "مدیریت ریسک در ترید",
    "مسیر آموزشی رسمی",
    "مسیر آموزشی تکمیلی",
    "آموزش ارز دیجیتال",
  ],
  alternates: {
    canonical: "https://tecpey.ir",
  },
  openGraph: {
    title: "تک‌پی، نقطه امن ورود به بازار رمزارز",
    description:
      "آموزش، ارزیابی، مسیر آموزشی تکمیلی، ورود حرفه‌ای به بازار",
    url: "https://tecpey.ir",
    siteName: "TecPey",
    locale: "fa_IR",
    type: "website",
    images: [{ url: "/images/tecpey-logo.png", width: 512, height: 512, alt: "TecPey" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "تک‌پی، نقطه امن ورود به بازار رمزارز",
    description: "آموزش، ارزیابی، مسیر آموزشی تکمیلی، ورود حرفه‌ای به بازار",
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
      name: "بازارها",
      item: "https://tecpey.ir/markets",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "آموزش رمزارز",
      item: "https://tecpey.ir/academy",
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
        text: "تک‌پی، نقطه امن ورود به بازار رمزارز است؛ آموزش رایگان، ارزیابی مرحله‌ای، مشاهده بازار زنده و مسیر آموزشی برای ورود آگاهانه را کنار هم قرار می‌دهد.",
      },
    },
    {
      "@type": "Question",
      name: "آیا تک‌پی برای خرید تتر و بیت‌کوین مناسب است؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "تک‌پی به کاربران کمک می‌کند قیمت تتر، بیت‌کوین و سایر رمزارزها را بررسی کنند و با مسیر ثبت‌نام واضح وارد معامله شوند.",
      },
    },
    {
      "@type": "Question",
      name: "آیا لندینگ تک‌پی در موبایل حرفه‌ای نمایش داده می‌شود؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "بله، ساختار صفحه موبایل‌فرست است و برای موبایل، تبلت و دسکتاپ بهینه شده است.",
      },
    },
    {
      "@type": "Question",
      name: "تک‌پی چطور به سوالات کاربران قبل از معامله پاسخ می‌دهد؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "تک‌پی با محتوای روشن، پرسش‌های پرتکرار و داده‌های ساختاریافته تلاش می‌کند پاسخ‌های دقیق‌تر و قابل فهم‌تری درباره ورود امن به بازار رمزارز ارائه کند.",
      },
    },
  ],
};


const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "راهنمای شروع معامله رمزارز در تک‌پی",
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
  about: ["خرید تتر", "خرید بیت‌کوین", "قیمت لحظه‌ای ارز دیجیتال", "آموزش ارز دیجیتال"],
  mainEntityOfPage: "https://tecpey.ir",
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <TecpeyEnterpriseLanding />
    </>
  );
}
