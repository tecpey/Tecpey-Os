import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, BriefcaseBusiness, EyeOff, GraduationCap, Medal, ShieldCheck, Sparkles, Trophy, XCircle } from "lucide-react";
import { getPublicProfile } from "@/lib/community-career";

function normalize(value: string) { return String(value || "").replace(/[^A-Z0-9_.@-]/gi, "").replace(/^@/, "").slice(0, 60); }

export async function generateMetadata({ params }: { params: Promise<{ studentId: string }> }): Promise<Metadata> {
  const { studentId } = await params;
  const safeId = normalize(studentId);
  const profile = await getPublicProfile(safeId);
  if (!profile) {
    return {
      title: "پروفایل دانشجو یافت نشد | تک‌پی",
      description: "این پروفایل عمومی در سامانه رسمی آکادمی تک‌پی تأیید نشده یا خصوصی است.",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${profile.displayName} | TecPey Learning Profile`,
    description: `پروفایل عمومی دانشجوی آکادمی تک‌پی: ${profile.level}، ${profile.achievementsCount} دستاورد و مسیر رشد آموزشی قابل مشاهده.`,
    alternates: { canonical: `https://tecpey.ir/student/${profile.username || safeId}` },
    robots: { index: true, follow: true },
  };
}

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Trophy }) {
  return (
    <article className="rounded-[30px] border border-slate-200 bg-white/95 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
      <Icon className="h-7 w-7 text-cyan-500" />
      <p className="mt-4 text-xs font-bold text-[color:var(--tp-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </article>
  );
}

export default async function StudentPublicProfilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const safeId = normalize(studentId);
  const profile = await getPublicProfile(safeId);

  if (!profile) {
    return (
      <main className="min-h-screen bg-[color:var(--tp-bg)] px-4 py-10 text-[color:var(--tp-text)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[40px] border border-rose-300/20 bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,.20),transparent_36%),linear-gradient(145deg,#06111f,#111827)] p-8 text-white shadow-[0_30px_90px_rgba(251,113,133,.10)]">
            <XCircle className="h-14 w-14 text-rose-300" />
            <h1 className="mt-5 text-3xl font-black sm:text-5xl">پروفایل عمومی در دسترس نیست</h1>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-300">این پروفایل یا در سامانه آکادمی پیدا نشد یا مالک آن نمایش عمومی را غیرفعال کرده است. برای حفظ حریم خصوصی، اطلاعات خصوصی دانشجو نمایش داده نمی‌شود.</p>
          </section>
          <Link href="/academy" className="inline-flex rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-black text-white">بازگشت به آکادمی</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--tp-bg)] px-4 py-10 text-[color:var(--tp-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-[40px] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.24),transparent_36%),linear-gradient(145deg,#06111f,#111827)] p-8 text-white shadow-[0_30px_90px_rgba(34,211,238,.14)]">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100"><ShieldCheck className="h-4 w-4" /> Verified Learning Identity</div>
              <h1 className="mt-5 text-4xl font-black sm:text-6xl">{profile.avatar} {profile.displayName}</h1>
              <p className="mt-3 text-sm font-bold text-slate-300">@{profile.username} · {profile.level}</p>
            </div>
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/10 text-5xl">{profile.avatar}</div>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="XP" value={profile.xp} icon={Trophy} />
          <Stat label="Streak" value={profile.streak} icon={Sparkles} />
          <Stat label="Achievements" value={profile.achievementsCount} icon={BadgeCheck} />
          <Stat label="Career Score" value={`${profile.careerScore}/100`} icon={BriefcaseBusiness} />
        </section>
        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-[34px] border border-emerald-300/20 bg-emerald-500/10 p-6">
            <Medal className="h-8 w-8 text-emerald-500" />
            <h2 className="mt-4 text-2xl font-black">نقاط قوت آموزشی</h2>
            <ul className="mt-4 space-y-3 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">{profile.strengths.map((item) => <li key={item}>✓ {item}</li>)}</ul>
          </article>
          <article className="rounded-[34px] border border-amber-300/20 bg-amber-400/10 p-6">
            <GraduationCap className="h-8 w-8 text-amber-500" />
            <h2 className="mt-4 text-2xl font-black">تمرکز بعدی</h2>
            <ul className="mt-4 space-y-3 text-sm font-bold leading-8 text-[color:var(--tp-muted)]">{profile.growthAreas.map((item) => <li key={item}>• {item}</li>)}</ul>
          </article>
        </section>
        <section className="rounded-[34px] border border-slate-200 bg-white/95 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
          <div className="flex gap-3"><EyeOff className="h-6 w-6 text-cyan-500" /><p className="text-sm font-black leading-8">این پروفایل عمومی فقط اطلاعات آموزشی و اجتماعی قابل نمایش را نشان می‌دهد؛ TecPey ID داخلی، اطلاعات تماس، ایمیل، داده خصوصی و سوابق حساس دانشجو منتشر نمی‌شود.</p></div>
        </section>
      </div>
    </main>
  );
}
