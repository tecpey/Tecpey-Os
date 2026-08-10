
import { ArticleSchema } from "@/components/seo/ArticleSchema";
import type { Metadata } from "next";
import Link from "next/link";
import { coinPages } from "@/data/coins";
import { ContentHero, ContentShell, TrustStrip } from "@/components/content/ContentUI";
import { CoinVisual } from "@/components/tecpey/CoinVisual";
import { ArrowLeft } from "lucide-react";

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
            <Link
              key={coin.slug}
              href={`/coins/${coin.slug}`}
              className="group overflow-hidden rounded-[30px] border border-cyan-300/15 bg-white/86 p-3 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-[0_24px_70px_rgba(34,211,238,.16)] focus:outline-none focus:ring-2 focus:ring-cyan-300/60 dark:bg-white/[0.055]"
            >
              <CoinVisual symbol={coin.symbol} slug={coin.slug} name={coin.name} faName={coin.faName} />
              <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-black text-slate-950 dark:text-white">
                      {coin.faName} ({coin.symbol})
                    </h2>
                    <p className="mt-1 text-xs font-black text-cyan-600 dark:text-cyan-300">
                      {displayMeta(coin.category)}
                    </p>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-600 transition group-hover:bg-cyan-500 group-hover:text-white dark:text-cyan-200">
                    <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">
                  {coin.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </ContentShell>
  );
}
