
import { ArticleSchema } from "@/components/seo/ArticleSchema";
import type { Metadata } from "next";
import { coinPages } from "@/data/coins";
import { ArticleCard, ContentHero, ContentShell, TrustStrip } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "خرید و راهنمای رمزارزها | تک‌پی",
  description: "راهنمای ساده خرید و شناخت بیت‌کوین، تتر، اتریوم، تون‌کوین، سولانا و ده‌ها رمزارز دیگر در تک‌پی؛ کاربردها، ریسک‌ها، نکات امنیتی و مسیر شروع.",
  alternates: { canonical: "https://tecpey.ir/coins" },
  keywords: ["قیمت ارز دیجیتال", "قیمت بیت کوین", "قیمت تتر", "خرید رمزارز", "صفحات کوین"],
};


const userFriendlyMeta: Record<string, string> = {
  "دارایی پایه بازار رمزارز": "پادشاه بازار ارزهای دیجیتال",
  "استیبل‌کوین": "پرکاربردترین استیبل‌کوین بازار",
  "شبکه قرارداد هوشمند": "اکوسیستم بزرگ برنامه‌های غیرمتمرکز",
  "شبکه بلاکچینی متصل به اکوسیستم تلگرام": "رمزارز متصل به اکوسیستم تلگرام",
  "شبکه سریع قرارداد هوشمند": "شبکه سریع برای برنامه‌های غیرمتمرکز",
  "دارایی انتقال ارزش": "رمزارز شناخته‌شده برای انتقال ارزش",
  "میم‌کوین": "رمزارز پرطرفدار جامعه‌محور",
  "شبکه لایه یک": "شبکه مستقل بلاکچینی",
  "شبکه قرارداد هوشمند نسل سوم": "شبکه هوشمند با تمرکز بر مقیاس‌پذیری",
  "شبکه انتقال و قرارداد هوشمند": "شبکه پرکاربرد برای انتقال و برنامه‌های رمزارزی",
  "شبکه چندزنجیره‌ای": "اکوسیستم چندزنجیره‌ای برای ارتباط بلاکچین‌ها",
  "دارایی پرداختی قدیمی": "رمزارز قدیمی و شناخته‌شده پرداختی",
  "فورک بیت‌کوین": "شاخه‌ای شناخته‌شده از بیت‌کوین",
  "اوراکل بلاکچینی": "پل داده‌های واقعی با قراردادهای هوشمند",
};

function displayMeta(category: string) {
  return userFriendlyMeta[category] ?? "راهنمای خرید و شناخت این رمزارز";
}

const schema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "راهنمای رمزارزهای تک‌پی",
  url: "https://tecpey.ir/coins",
  inLanguage: "fa-IR",
  about: ["Crypto Prices", "Bitcoin", "USDT", "Ethereum", "Altcoins"],
};

export default function CoinsPage() {
  return (
    <ContentShell>
      <ArticleSchema headline="راهنمای رمزارزهای تک‌پی" description="صفحات آموزشی رمزارزها برای بررسی کاربرد، ریسک، شبکه انتقال و نکات مهم قبل از خرید." url="https://tecpey.ir/coins" language="fa-IR" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <ContentHero
        eyebrow="راهنمای رمزارزها"
        title="خرید بیت‌کوین، تتر، تون‌کوین و ده‌ها ارز دیجیتال دیگر"
        description="قبل از خرید، کاربرد، مزایا، ریسک‌ها، شبکه انتقال و نکات مهم هر ارز را به زبان ساده بخوانید و بعد با آگاهی وارد بازار شوید."
        ctaHref="/markets"
        ctaLabel="مشاهده قیمت لحظه‌ای"
      />
      <TrustStrip />
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-3">
          {coinPages.map((coin) => (
            <ArticleCard
              key={coin.slug}
              href={`/coins/${coin.slug}`}
              title={`${coin.faName} (${coin.symbol})`}
              description={coin.description}
              meta={displayMeta(coin.category)}
            />
          ))}
        </div>
      </section>
    </ContentShell>
  );
}
