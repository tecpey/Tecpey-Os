import type { Metadata } from "next";
import Link from "next/link";
import { ContentShell } from "@/components/content/ContentUI";
import { Award, BadgeCheck, Download, GraduationCap, Printer, Share2, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "لحظه فارغ‌التحصیلی آکادمی تک‌پی",
  description: "تجربه افتخارآمیز پایان مسیر آموزشی تک‌پی با دریافت مدرک قابل استعلام، پروفایل عمومی و دعوت مشروط به مسیر تخصصی.",
  alternates: { canonical: "https://tecpey.ir/academy/graduation" },
};

export default function GraduationMomentPage() {
  return (
    <ContentShell>
      <main className="min-h-screen px-4 py-12 text-[color:var(--tp-text)] sm:px-6 lg:px-8">
        <section className="mx-auto max-w-6xl overflow-hidden rounded-[46px] border border-emerald-300/25 bg-[radial-gradient(circle_at_top,rgba(16,185,129,.26),transparent_40%),linear-gradient(145deg,#06131f,#111827)] p-8 text-center text-white shadow-[0_40px_130px_rgba(16,185,129,.15)] lg:p-12">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-full border border-emerald-300/30 bg-emerald-300/15">
            <GraduationCap className="h-12 w-12 text-emerald-300" />
          </div>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-xs font-black text-emerald-100">
            <Sparkles className="h-4 w-4" /> TecPey Graduation Moment
          </div>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">پایان مسیر پایه، شروع هویت حرفه‌ای</h1>
          <p className="mx-auto mt-5 max-w-3xl text-sm font-bold leading-8 text-slate-300 sm:text-base">این صفحه برای لحظه‌ای طراحی شده که دانشجو مسیر اصلی آکادمی را تکمیل می‌کند؛ لحظه‌ای که باید حس افتخار، اعتبار و ادامه مسیر را منتقل کند، نه فقط دانلود یک فایل.</p>
          <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-4">
            {[{label:"مدرک قابل استعلام",icon:BadgeCheck},{label:"QR Verification",icon:Award},{label:"قابل چاپ",icon:Printer},{label:"قابل اشتراک",icon:Share2}].map((item)=>{const Icon=item.icon;return <div key={item.label} className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5"><Icon className="mx-auto h-7 w-7 text-emerald-300"/><p className="mt-3 text-sm font-black text-white">{item.label}</p></div>})}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/academy/certificates" className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-6 py-4 text-sm font-black text-slate-950"><Download className="h-4 w-4"/>دریافت مدرک</Link>
            <Link href="/academy/specialized-program" className="rounded-2xl border border-emerald-300/30 px-6 py-4 text-sm font-black text-emerald-100">درخواست بررسی مسیر تخصصی</Link>
          </div>
        </section>
      </main>
    </ContentShell>
  );
}
