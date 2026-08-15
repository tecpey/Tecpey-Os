import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import * as QRCode from "qrcode";
import { Award, BadgeCheck, CalendarDays, Fingerprint, Medal, QrCode, ShieldCheck, UserRound } from "lucide-react";
import { PublicCredentialShareButton } from "@/components/community/PublicCredentialShareButton";
import { getPublicProfile } from "@/lib/community-career";
import { PLATFORM } from "@/lib/platform-config";
import {
  normalizePublicCredentialId,
  normalizePublicProfileIdentifier,
  publicCredentialVerificationPath,
} from "@/lib/public-credential-verification-id";

export const dynamic = "force-dynamic";

const loadVerification = cache(async (studentId: string, credentialId: string) => {
  const profileIdentifier = normalizePublicProfileIdentifier(studentId);
  const publicCredentialId = normalizePublicCredentialId(credentialId);
  if (!profileIdentifier || !publicCredentialId) return null;
  const profile = await getPublicProfile(profileIdentifier);
  const credential = profile?.publicCredentials.find((item) => item.publicId === publicCredentialId);
  return profile && credential ? { profile, credential } : null;
});

type Props = { params: Promise<{ studentId: string; credentialId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { studentId, credentialId } = await params;
  const result = await loadVerification(studentId, credentialId);
  if (!result) {
    return {
      title: "اعتبارنامه یافت نشد | تک‌پی",
      description: "این اعتبارنامه عمومی در سامانه رسمی آکادمی تک‌پی معتبر نیست یا دیگر برای نمایش عمومی در دسترس نیست.",
      robots: { index: false, follow: false },
    };
  }
  const path = publicCredentialVerificationPath({
    profileIdentifier: result.profile.publicProfileId,
    credentialId: result.credential.publicId,
  });
  return {
    title: `${result.credential.titleFa} | اعتبارنامه تأییدشده تک‌پی`,
    description: `استعلام زنده اعتبارنامه ${result.profile.displayName} صادرشده توسط ${result.credential.issuer}.`,
    alternates: { canonical: `${PLATFORM.SITE_URL.replace(/\/$/, "")}${path}` },
    robots: { index: true, follow: true },
  };
}

export default async function PublicCredentialVerificationPage({ params }: Props) {
  const { studentId, credentialId } = await params;
  const result = await loadVerification(studentId, credentialId);
  if (!result) notFound();

  const { profile, credential } = result;
  const path = publicCredentialVerificationPath({
    profileIdentifier: profile.publicProfileId,
    credentialId: credential.publicId,
  });
  if (!path) notFound();
  const verificationUrl = `${PLATFORM.SITE_URL.replace(/\/$/, "")}${path}`;
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
    color: { dark: "#020617", light: "#ffffff" },
  });
  const fingerprint = credential.publicId.toUpperCase().match(/.{1,6}/g)?.join("-") ?? credential.publicId;

  return (
    <main className="min-h-dvh bg-[color:var(--tp-bg)] px-4 py-8 text-[color:var(--tp-text)] sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
        <section className="overflow-hidden rounded-[36px] border border-emerald-300/20 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,.22),transparent_38%),linear-gradient(145deg,#06111f,#111827)] p-6 text-white shadow-[0_30px_90px_rgba(16,185,129,.12)] sm:rounded-[40px] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-xs font-black text-emerald-100"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> TecPey Live Verification</div>
              <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">اعتبارنامه معتبر و فعال است</h1>
              <p className="mt-4 text-sm font-bold leading-8 text-slate-300">این نتیجه مستقیماً از دفتر رسمی اعتبارنامه‌های آکادمی تک‌پی خوانده شده است. وضعیت لغو، تعلیق، انقضا و رضایت نمایش عمومی در همین لحظه بررسی شده‌اند.</p>
            </div>
            <BadgeCheck className="h-16 w-16 shrink-0 text-emerald-300" aria-label="تأییدشده" />
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.06] sm:rounded-[36px] sm:p-8" aria-labelledby="credential-title">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-center">
            <div>
              <div className="flex items-start gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/10 text-amber-600 dark:text-amber-300"><Medal className="h-7 w-7" aria-hidden="true" /></span>
                <div>
                  <p className="text-xs font-black text-emerald-600 dark:text-emerald-300">VERIFIED CREDENTIAL</p>
                  <h2 id="credential-title" className="mt-2 text-2xl font-black leading-9 sm:text-3xl">{credential.titleFa}</h2>
                  <p className="mt-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{credential.descriptionFa}</p>
                </div>
              </div>

              <dl className="mt-7 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><UserRound className="h-5 w-5 text-cyan-500" aria-hidden="true" /><dt className="mt-3 text-xs font-bold text-[color:var(--tp-muted)]">دارنده عمومی</dt><dd className="mt-1 font-black">{profile.displayName}</dd></div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><Award className="h-5 w-5 text-cyan-500" aria-hidden="true" /><dt className="mt-3 text-xs font-bold text-[color:var(--tp-muted)]">صادرکننده</dt><dd className="mt-1 font-black">{credential.issuer}</dd></div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><CalendarDays className="h-5 w-5 text-cyan-500" aria-hidden="true" /><dt className="mt-3 text-xs font-bold text-[color:var(--tp-muted)]">تاریخ صدور</dt><dd className="mt-1 font-black tabular-nums">{new Intl.DateTimeFormat("fa-IR", { dateStyle: "long" }).format(new Date(credential.issuedAt))}</dd></div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><Fingerprint className="h-5 w-5 text-cyan-500" aria-hidden="true" /><dt className="mt-3 text-xs font-bold text-[color:var(--tp-muted)]">اثر انگشت عمومی</dt><dd className="mt-1 break-all font-mono text-sm font-black" dir="ltr">{fingerprint}</dd></div>
              </dl>
              {credential.rank ? <p className="mt-4 inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-black text-amber-700 dark:text-amber-200">رتبه رسمی: {credential.rank}</p> : null}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-4 text-center dark:border-white/10 dark:bg-white/90">
              {/* eslint-disable-next-line @next/next/no-img-element -- #458: generated QR data URL is bounded, server-rendered and must not traverse the optimizer. */}
              <img src={qrDataUrl} alt="کد QR استعلام زنده اعتبارنامه تک‌پی" width={208} height={208} className="mx-auto h-52 w-52" />
              <p className="mt-3 inline-flex items-center gap-2 text-xs font-black text-slate-700"><QrCode className="h-4 w-4" aria-hidden="true" /> اسکن برای استعلام زنده</p>
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-cyan-300/20 bg-cyan-400/10 p-5 sm:p-6">
          <h2 className="text-lg font-black">محافظت در برابر جعل</h2>
          <p className="mt-2 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">تصویر یا فایل مدرک به‌تنهایی اثبات اعتبار نیست. فقط آدرس رسمی روی دامنه تک‌پی، وضعیت سبز «معتبر و فعال» و اثر انگشت یکسان را ملاک قرار دهید. اگر اعتبارنامه لغو، منقضی یا خصوصی شود، این لینک دیگر تأیید نخواهد شد.</p>
        </section>

        <div className="flex flex-wrap items-start gap-3">
          <PublicCredentialShareButton title={`${credential.titleFa} | اعتبارنامه تأییدشده تک‌پی`} />
          <Link href={`/student/${encodeURIComponent(profile.publicProfileId)}`} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition-colors duration-200 hover:bg-cyan-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/40">مشاهده پروفایل عمومی</Link>
        </div>
      </div>
    </main>
  );
}
