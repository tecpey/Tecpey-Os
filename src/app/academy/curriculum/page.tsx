import type { Metadata } from "next";
import Link from "next/link";
import { ContentShell } from "@/components/content/ContentUI";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "مسیر ۷ ترمی آکادمی | آکادمی تک‌پی", description: "آکادمی تک‌پی از مبانی شروع می‌شود و تا امنیت، کار با صرافی، تحلیل، مدیریت ریسک و آمادگی حرفه‌ای ادامه پیدا می‌کند." };

const items = ["ترم ۱: مبانی بلاکچین و رمزارز", "ترم ۲: امنیت حساب و نگهداری دارایی", "ترم ۳ تا ۵: کار با صرافی، تکنیکال و فاندامنتال", "ترم ۶ و ۷: مدیریت سرمایه، روانشناسی و آمادگی حرفه‌ای"];

export default function Page() {
  return (
    <ContentShell>
      <main className="bg-[color:var(--tp-bg)] px-4 py-24 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-5xl rounded-[34px] border border-cyan-300/15 bg-white/[0.07] p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl lg:p-10">
          <div className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-200">آکادمی تک‌پی</div>
          <h1 className="mt-5 text-3xl font-black leading-tight text-white sm:text-5xl">مسیر ۷ ترمی آکادمی</h1>
          <p className="mt-5 text-base font-bold leading-9 text-slate-300">آکادمی تک‌پی از مبانی شروع می‌شود و تا امنیت، کار با صرافی، تحلیل، مدیریت ریسک و آمادگی حرفه‌ای ادامه پیدا می‌کند.</p>
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
