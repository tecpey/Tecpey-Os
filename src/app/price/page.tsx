
import type { Metadata } from "next";
import Link from "next/link";
import { coinPages } from "@/data/coins";
import { ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "قیمت ارز دیجیتال | نرخ لحظه‌ای، آموزش و ریسک‌ها در تک‌پی",
  description: "قیمت رمزارزهای مهم در تک‌پی همراه با اتصال به مارکت‌برد، آموزش مرتبط، ریسک‌ها و سوالات پرتکرار برای تصمیم‌گیری آگاهانه.",
  alternates: { canonical: "https://tecpey.ir/price" },
};

export default function PriceIndexPage() {
  return (
    <ContentShell>
      <main className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-4xl font-black text-slate-950 dark:text-white">قیمت ارز دیجیتال در تک‌پی</h1>
          <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">هر صفحه قیمت، داده بازار را به آموزش مرتبط، ریسک‌ها و مسیر آکادمی تک‌پی وصل می‌کند تا کاربر قبل از تصمیم، تصویر روشن‌تری داشته باشد.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {coinPages.slice(0, 16).map((coin) => (
              <Link key={coin.slug} href={`/price/${coin.slug}`} className="rounded-[28px] border border-slate-200 bg-white/85 p-5 transition hover:-translate-y-1 hover:border-cyan-300 dark:border-white/10 dark:bg-white/[0.04]">
                <p className="text-lg font-black text-slate-950 dark:text-white">{coin.faName}</p>
                <p className="mt-1 text-sm font-black text-cyan-600 dark:text-cyan-300">{coin.symbol}</p>
                <p className="mt-3 line-clamp-3 text-xs font-bold leading-7 text-slate-600 dark:text-slate-300">{coin.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </ContentShell>
  );
}
