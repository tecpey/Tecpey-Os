import type { Metadata } from "next";
import { Client } from "pg";
import Link from "next/link";
import { BadgeCheck, CalendarDays, GraduationCap, QrCode, ShieldCheck, XCircle } from "lucide-react";
import { ensureCertificateTables, getCertificate } from "@/lib/academy-certificates";
import { ensureStudentCartaxTables } from "@/lib/student-cartax";

export async function generateMetadata({ params }: { params: Promise<{ certificateId: string }> }): Promise<Metadata> {
  const { certificateId } = await params;
  const id = normalizeId(certificateId);
  const cert = await readCertificate(id);
  const verified = Boolean(cert && cert.status === "verified" && !cert.revoked_at);
  if (!verified) {
    return {
      title: "مدرک یافت نشد | تک‌پی",
      description: "این مدرک در سامانه رسمی آکادمی تک‌پی تأیید نشده است.",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${cert.course_title} | مدرک تأییدشده تک‌پی`,
    description: `استعلام مدرک تأییدشده ${cert.student_name} در آکادمی تک‌پی.`,
    alternates: { canonical: `https://tecpey.ir/verify/${id}` },
    robots: { index: true, follow: true },
  };
}

async function readCertificate(id: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await ensureStudentCartaxTables(client);
    await ensureCertificateTables(client);
    return await getCertificate(client, id);
  } catch { return null; } finally { await client.end(); }
}

function normalizeId(value: string) { return String(value || "").replace(/[^A-Z0-9\-]/gi, "").slice(0, 80); }

export default async function VerifyCertificatePage({ params }: { params: Promise<{ certificateId: string }> }) {
  const { certificateId } = await params;
  const id = normalizeId(certificateId);
  const cert = await readCertificate(id);
  const verified = Boolean(cert && cert.status === "verified" && !cert.revoked_at);

  return (
    <main className="min-h-screen bg-[color:var(--tp-bg)] px-4 py-10 text-[color:var(--tp-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="overflow-hidden rounded-[40px] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.24),transparent_36%),linear-gradient(145deg,#06111f,#111827)] p-6 text-white shadow-[0_30px_90px_rgba(34,211,238,.14)] lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100"><ShieldCheck className="h-4 w-4" /> TecPey Certificate Verification</div>
              <h1 className="mt-5 text-3xl font-black sm:text-5xl">{verified ? "مدرک آکادمی تک‌پی تأیید شد" : "مدرک در سامانه رسمی یافت نشد"}</h1>
              <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-300">{verified ? "این صفحه نشان می‌دهد گواهی از طرف TecPey Academy صادر شده و وضعیت آن در سامانه استعلام معتبر است." : "برای جلوگیری از جعل، فقط مدارکی که در پایگاه رسمی تک‌پی ثبت شده باشند با وضعیت Verified نمایش داده می‌شوند."}</p>
            </div>
            {verified ? <BadgeCheck className="h-16 w-16 text-emerald-300" /> : <XCircle className="h-16 w-16 text-rose-300" />}
          </div>
        </section>

        <section className="rounded-[36px] border border-slate-200 bg-white/95 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.06] lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
            <div className="space-y-5">
              <div>
                <p className="text-xs font-black text-[color:var(--tp-muted)]">Certificate ID</p>
                <p className="mt-2 break-all text-2xl font-black text-slate-950 dark:text-white">{id}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><GraduationCap className="h-5 w-5 text-cyan-500" /><p className="mt-3 text-xs font-bold text-[color:var(--tp-muted)]">Course</p><p className="mt-1 font-black">{cert?.course_title || "TecPey Academy"}</p></div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><CalendarDays className="h-5 w-5 text-cyan-500" /><p className="mt-3 text-xs font-bold text-[color:var(--tp-muted)]">Issued</p><p className="mt-1 font-black">{cert?.issued_at ? new Date(cert.issued_at).toLocaleDateString("fa-IR") : "—"}</p></div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><p className="text-xs font-bold text-[color:var(--tp-muted)]">Student</p><p className="mt-2 font-black">{cert?.student_name || "—"}</p></div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><p className="text-xs font-bold text-[color:var(--tp-muted)]">Status</p><p className={`mt-2 font-black ${verified ? "text-emerald-600" : "text-rose-600"}`}>{verified ? "Verified" : "Not verified"}</p></div>
              </div>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-white p-4 text-center dark:border-white/10 dark:bg-white/90">
              <img src={`/api/academy-certificates/qr/${id}`} alt="certificate QR" className="mx-auto h-44 w-44" />
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-black text-slate-700"><QrCode className="h-4 w-4" /> QR Verification</p>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/academy" className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">بازگشت به آکادمی</Link>
          <Link href="/academy/certificates" className="rounded-2xl border border-cyan-300/30 px-5 py-3 text-sm font-black">مدارک من</Link>
        </div>
      </div>
    </main>
  );
}
