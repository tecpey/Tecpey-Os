
import type { Metadata } from "next";
import Link from "next/link";
import { learningSeoPages } from "@/data/organicSeo";
import { ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "مرکز یادگیری ارز دیجیتال تک‌پی | آموزش، منتور، شبیه‌ساز و مدرک",
  description: "مرکز یادگیری تک‌پی برای آموزش ارز دیجیتال، بیت‌کوین، تتر، شبیه‌ساز ترید، مدرک قابل استعلام و مسیر حرفه‌ای آکادمی.",
  alternates: { canonical: "https://tecpey.ir/learn" },
};

export default function LearnIndexPage() {
  return (
    <ContentShell>
      <main className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[38px] border border-cyan-300/20 bg-white/85 p-8 dark:bg-white/[0.045]">
            <p className="text-sm font-black text-cyan-600 dark:text-cyan-300">TecPey Learning Center</p>
            <h1 className="mt-4 text-4xl font-black text-slate-950 dark:text-white">مرکز یادگیری ارز دیجیتال تک‌پی</h1>
            <p className="mt-4 max-w-4xl text-base font-bold leading-9 text-slate-600 dark:text-slate-300">مسیرهای آموزشی تک‌پی برای شروع امن در بازار رمزارز؛ از مفاهیم پایه تا شبیه‌ساز، مدرک قابل استعلام و برنامه‌های حرفه‌ای.</p>
          </div>
          <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {learningSeoPages.map((page) => (
              <Link key={page.slug} href={`/learn/${page.slug}`} className="rounded-[30px] border border-slate-200 bg-white/85 p-6 transition hover:-translate-y-1 hover:border-cyan-300 dark:border-white/10 dark:bg-white/[0.04]">
                <h2 className="text-xl font-black leading-8 text-slate-950 dark:text-white">{page.h1}</h2>
                <p className="mt-3 line-clamp-3 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">{page.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </ContentShell>
  );
}
