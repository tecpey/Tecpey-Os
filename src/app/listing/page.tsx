import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { ContentHero, ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "درخواست لیست شدن رمزارز | تک‌پی",
  description: "مسیر پیشنهادی برای بررسی پروژه‌ها و دارایی‌های دیجیتال در تک‌پی.",
  alternates: { canonical: "https://tecpey.ir/listing" },
};

const cards = [
  { title: "بررسی پروژه", desc: "تیم، کاربرد، امنیت، نقدشوندگی و وضعیت جامعه پروژه اهمیت دارد." },
  { title: "بررسی ریسک", desc: "هر دارایی جدید باید از نظر ریسک کاربر و شفافیت اطلاعات بررسی شود." },
  { title: "درخواست رسمی", desc: "برای شروع بررسی، از صفحه تماس با ما یا ایمیل info@tecpey.ir اقدام کنید." }
];

export default function Page() {
  return (
    <ContentShell>
      <ContentHero eyebrow="TecPey" title="درخواست لیست شدن رمزارز" description="مسیر پیشنهادی برای بررسی پروژه‌ها و دارایی‌های دیجیتال در تک‌پی." ctaHref="/contact-us" ctaLabel="ارتباط با تک‌پی" />
      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[34px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.16),transparent_34%),linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-2xl shadow-cyan-500/10 md:p-8">
            <h2 className="text-2xl font-black">خلاصه مسیر</h2>
            <p className="mt-4 max-w-4xl text-base leading-9 text-white/72">لیست شدن یک رمزارز باید بر اساس معیارهای شفاف، امنیت، نقدشوندگی و نیاز واقعی کاربران بررسی شود.</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {cards.map((item) => (
              <div key={item.title} className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                <h3 className="mt-4 text-xl font-black text-slate-950 dark:text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-8 text-slate-600 dark:text-slate-300">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/academy" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20">مطالعه آکادمی <ArrowLeft className="h-5 w-5" /></Link>
            <Link href="/markets" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white">مشاهده بازارها</Link>
          </div>
        </div>
      </section>
    </ContentShell>
  );
}
