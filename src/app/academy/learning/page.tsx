import type { Metadata } from "next";
import Link from "next/link";
import { ContentShell } from "@/components/content/ContentUI";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "شروع مسیر یادگیری | آکادمی تک‌پی", description: "در این بخش کاربر از صفر شروع می‌کند؛ بدون اصطلاحات پیچیده و بدون وعده سود. هدف این است که قبل از معامله، تصویر درستی از بازار و ریسک‌ها داشته باشد." };

const items = ["پول، بیت‌کوین و بلاکچین به زبان ساده", "تتر و نقش آن برای کاربران ایرانی", "کیف پول و تفاوت آن با صرافی", "اولین خرید امن و اشتباهات رایج تازه‌کارها"];

export default function Page() {
  return (
    <ContentShell>
      <main className="bg-[color:var(--tp-bg)] px-4 py-24 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-5xl rounded-[34px] border border-cyan-300/15 bg-white/[0.07] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl lg:p-10">
          <div className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-200">آکادمی تک‌پی</div>
          <h1 className="mt-5 text-3xl font-black leading-tight text-white sm:text-5xl">شروع مسیر یادگیری</h1>
          <p className="mt-5 text-base font-bold leading-9 text-slate-300">در این بخش کاربر از صفر شروع می‌کند؛ بدون اصطلاحات پیچیده و بدون وعده سود. هدف این است که قبل از معامله، تصویر درستی از بازار و ریسک‌ها داشته باشد.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <div key={item} className="rounded-[24px] border border-cyan-300/15 bg-slate-950/35 p-5">
                <CheckCircle2 className="h-6 w-6 text-cyan-300" />
                <p className="mt-3 text-sm font-bold leading-8 text-slate-200">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/academy/term-1" className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">
              ادامه مسیر
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link href="/academy" className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15">
              بازگشت به آکادمی
            </Link>
          </div>
        </section>
      </main>
    </ContentShell>
  );
}
