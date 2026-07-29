import type { Metadata } from "next";
import Link from "next/link";
import { ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = { title: "آمادگی واقعی پیش از ورود | آکادمی تک‌پی", description: "چک‌لیست نهایی آکادمی تک‌پی برای سنجش دانش، امنیت، مدیریت ریسک و تصمیم‌گیری مسئولانه پیش از ورود به بازار رمزارز." };

const items = ["مرور مفاهیم پایه رمزارز", "بررسی امنیت حساب و کیف پول", "سنجش توان مدیریت ریسک", "چک‌لیست تصمیم‌گیری قبل از اولین اقدام جدی"];

export default function ReadinessPage() {
  return (
    <ContentShell>
      <main className="px-4 py-16 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-5xl rounded-[34px] border border-cyan-300/15 bg-[#06111f] p-8 shadow-[0_24px_80px_rgba(0,0,0,.25)]">
          <p className="text-sm font-black text-cyan-300">TecPey Academy Readiness</p>
          <h1 className="mt-5 text-3xl font-black leading-tight text-white sm:text-5xl">آمادگی واقعی پیش از ورود</h1>
          <p className="mt-5 text-base font-bold leading-9 text-slate-300">این صفحه جایزه، سود یا وعده مالی معرفی نمی‌کند. هدف آن این است که کاربر بعد از مسیر آموزشی بداند آیا از نظر دانش، امنیت، مدیریت ریسک و کنترل هیجان برای ورود مسئولانه به بازار آماده‌تر شده است یا نه.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {items.map((item) => <div key={item} className="rounded-2xl border border-cyan-300/15 bg-white/[0.055] p-4 text-sm font-black leading-8 text-slate-100">{item}</div>)}
          </div>
          <Link href="/academy/term-7" className="mt-7 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">رفتن به ترم آمادگی نهایی</Link>
        </section>
      </main>
    </ContentShell>
  );
}
