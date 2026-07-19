import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, DatabaseZap, ShieldCheck, Workflow } from "lucide-react";

export const metadata: Metadata = {
  title: "سناریوهای معاملاتی | آکادمی تک‌پی",
  description: "سناریوهای آموزشی معاملاتی تک‌پی در حال انتقال به موتور اجرایی سروری و قابل‌ردیابی هستند.",
  alternates: { canonical: "https://tecpey.ir/academy/trading-arena/scenarios" },
};

export default function ScenariosPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 sm:px-6 lg:px-8" dir="rtl">
      <main className="mx-auto max-w-3xl">
        <div className="rounded-[32px] border border-cyan-300/15 bg-slate-900/75 p-7 shadow-2xl shadow-black/20 sm:p-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10">
            <Workflow className="h-7 w-7 text-cyan-300" />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Secure migration in progress</p>
          <h1 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">سناریوهای آموزشی در حال انتقال به موتور معتبر آرنا هستند</h1>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-400">
            نسخه قدیمی سناریوها state معامله و پیشرفت را داخل مرورگر نگه می‌داشت. برای جلوگیری از دو منبع حقیقت، آن مسیر از محیط production خارج شده تا سناریوها با شناسه فرمان، revision، ثبت رویداد و تاریخچه cross-device بازگردند.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <p className="mt-3 text-sm font-black">بدون اجرای موازی</p>
              <p className="mt-1 text-xs font-bold leading-6 text-slate-500">هیچ معامله‌ای در حافظه مرورگر به‌عنوان حساب آرنا ثبت نمی‌شود.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <DatabaseZap className="h-5 w-5 text-violet-300" />
              <p className="mt-3 text-sm font-black">پیشرفت سروری</p>
              <p className="mt-1 text-xs font-bold leading-6 text-slate-500">نتیجه سناریو باید از هر دستگاه قابل بازیابی و برای Mentor قابل‌استناد باشد.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <Workflow className="h-5 w-5 text-cyan-300" />
              <p className="mt-3 text-sm font-black">فرمان قابل‌ردیابی</p>
              <p className="mt-1 text-xs font-bold leading-6 text-slate-500">هر تصمیم با idempotency، revision و event evidence اجرا خواهد شد.</p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs font-bold leading-6 text-amber-200">
            حساب اصلی آرنا و ژورنال سروری فعال هستند. فقط موتور سناریوهای قدیمی تا تکمیل قرارداد جدید در دسترس نیست.
          </div>

          <Link
            href="/academy/trading-arena"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            بازگشت به آرنای امن
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
