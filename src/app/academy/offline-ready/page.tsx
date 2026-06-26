import { WifiOff, ShieldCheck, RefreshCw, Smartphone, BookOpen, FileText } from "lucide-react";
import { offlineManifest } from "@/lib/offline-sync";

export const metadata = {
  title: "قابلیت آفلاین آکادمی تک‌پی",
  description: "مسیر Offline-first آکادمی تک‌پی برای درس‌ها، ژورنال تمرین، Replay و همگام‌سازی امن بعد از اتصال اینترنت.",
  robots: { index: false, follow: false },
};

export default function AcademyOfflineReadyPage() {
  const manifest = offlineManifest("fa");
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,.16),transparent_32%),#020617] px-4 py-12 text-white" dir="rtl">
      <section className="mx-auto max-w-6xl">
        <div className="rounded-[40px] border border-cyan-300/20 bg-white/[0.06] p-6 shadow-[0_30px_120px_rgba(34,211,238,.12)] lg:p-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100"><WifiOff className="h-4 w-4" /> Offline-first Foundation</p>
              <h1 className="mt-5 text-3xl font-black sm:text-5xl">آکادمی تک‌پی حتی بدون اینترنت هم مسیر یادگیری را نگه می‌دارد</h1>
              <p className="mt-4 max-w-3xl text-sm leading-8 text-slate-300">درس‌های ذخیره‌شده، یادداشت‌ها، ژورنال تمرین و Replay می‌توانند آفلاین استفاده شوند. هر چیزی که روی مدرک، رتبه یا باز شدن ترم بعد اثر دارد، بعد از اتصال اینترنت توسط سرور تأیید می‌شود.</p>
            </div>
            <div className="grid h-24 w-24 place-items-center rounded-[32px] border border-cyan-300/20 bg-cyan-300/10"><Smartphone className="h-10 w-10 text-cyan-200" /></div>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[34px] border border-emerald-300/20 bg-emerald-300/[0.06] p-6">
            <h2 className="flex items-center gap-2 text-2xl font-black"><BookOpen className="h-6 w-6 text-emerald-200" /> قابل استفاده در حالت آفلاین</h2>
            <div className="mt-5 grid gap-3">
              {manifest.offlineReady.map((item) => <div key={item.key} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 font-bold text-slate-200">{item.label}</div>)}
            </div>
          </div>
          <div className="rounded-[34px] border border-amber-300/20 bg-amber-300/[0.06] p-6">
            <h2 className="flex items-center gap-2 text-2xl font-black"><ShieldCheck className="h-6 w-6 text-amber-200" /> نیازمند تأیید آنلاین</h2>
            <div className="mt-5 grid gap-3">
              {manifest.onlineRequired.map((item) => <div key={item.key} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 font-bold text-slate-200">{item.label}</div>)}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[34px] border border-violet-300/20 bg-white/[0.055] p-6">
          <h2 className="flex items-center gap-2 text-2xl font-black"><RefreshCw className="h-6 w-6 text-violet-200" /> Sync Engine</h2>
          <p className="mt-3 text-sm leading-8 text-slate-300">وقتی اینترنت قطع باشد، رویدادهای مجاز در صف آفلاین ذخیره می‌شوند. بعد از اتصال، به ترتیب زمانی به سرور ارسال می‌شوند. رویدادهای حساس مثل صدور مدرک، باز شدن ترم و رتبه‌بندی هرگز از کلاینت پذیرفته نمی‌شوند.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><FileText className="mb-3 h-5 w-5 text-cyan-200" /><b>Local Queue</b><p className="mt-2 text-xs leading-6 text-slate-400">یادداشت، ژورنال و تمرین‌ها موقتاً در دستگاه ذخیره می‌شوند.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><RefreshCw className="mb-3 h-5 w-5 text-cyan-200" /><b>Sync</b><p className="mt-2 text-xs leading-6 text-slate-400">بعد از آنلاین شدن، داده‌ها با session آکادمی ارسال می‌شوند.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><ShieldCheck className="mb-3 h-5 w-5 text-cyan-200" /><b>Server Validation</b><p className="mt-2 text-xs leading-6 text-slate-400">اثرگذاری روی مدرک، رتبه و ترم فقط با تأیید سرور است.</p></div>
          </div>
        </div>
      </section>
    </main>
  );
}
