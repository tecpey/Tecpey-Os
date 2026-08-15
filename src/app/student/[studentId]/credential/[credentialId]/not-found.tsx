import Link from "next/link";
import { ShieldAlert, XCircle } from "lucide-react";

export default function PublicCredentialNotFound() {
  return (
    <main className="min-h-dvh bg-[color:var(--tp-bg)] px-4 py-10 text-[color:var(--tp-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-[36px] border border-rose-300/20 bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,.18),transparent_38%),linear-gradient(145deg,#06111f,#111827)] p-6 text-white shadow-[0_30px_90px_rgba(251,113,133,.10)] sm:rounded-[40px] sm:p-8">
          <XCircle className="h-14 w-14 text-rose-300" aria-hidden="true" />
          <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">اعتبارنامه عمومی تأیید نشد</h1>
          <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-300">این شناسه در دفتر عمومی تک‌پی معتبر نیست یا اعتبارنامه لغو، منقضی، تعلیق یا از حالت عمومی خارج شده است. برای حفظ حریم خصوصی، علت دقیق یا اطلاعات مالک نمایش داده نمی‌شود.</p>
        </section>
        <section className="flex gap-3 rounded-[28px] border border-slate-200 bg-white/95 p-5 dark:border-white/10 dark:bg-white/[0.06]">
          <ShieldAlert className="h-6 w-6 shrink-0 text-amber-500" aria-hidden="true" />
          <p className="text-sm font-bold leading-7">به تصویر، اسکرین‌شات یا فایل PDF اعتماد نکنید. فقط نتیجه زنده روی دامنه رسمی تک‌پی معیار اعتبار است.</p>
        </section>
        <Link href="/academy" className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/40">بازگشت به آکادمی</Link>
      </div>
    </main>
  );
}
