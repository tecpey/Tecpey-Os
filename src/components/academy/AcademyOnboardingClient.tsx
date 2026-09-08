"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { AcademyProfileUnavailableState } from "@/components/academy/AcademyProfileUnavailableState";
import { resolveAcademyProfileReadState } from "@/lib/academy-profile-read-state";

type Locale = "fa" | "en";
type ProfileResponse = {
  ok?: boolean;
  authenticated?: boolean;
  profile?: {
    display_name?: string | null;
    username?: string | null;
    avatar?: string | null;
    photo_url?: string | null;
    public_student_id?: string | null;
    learning_goal?: string | null;
    email?: string | null;
    phone?: string | null;
    birth_date?: string | null;
    gender?: string | null;
    country?: string | null;
  } | null;
};

const avatarOptions = ["🟦", "🟣", "🟢", "🟠", "⚡", "🎓", "🧠", "📈"];
const goalsFa = ["ورود امن به بازار", "یادگیری سرمایه‌گذاری", "تمرین ترید", "ساخت مسیر حرفه‌ای"];
const goalsEn = ["Safe market entry", "Learn investing", "Practice trading", "Build a professional path"];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalizeUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 32);
}

function dateInputValue(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

export function AcademyOnboardingClient({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const router = useRouter();
  const [profileStatus, setProfileStatus] = useState<"loading" | "ready" | "unauthenticated" | "unavailable">("loading");
  const [retryVersion, setRetryVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState(avatarOptions[0]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [goal, setGoal] = useState(isFa ? goalsFa[0] : goalsEn[0]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");
  const [publicStudentId, setPublicStudentId] = useState("");
  const [error, setError] = useState("");
  const [existingProfile, setExistingProfile] = useState(false);

  const usernameHint = useMemo(
    () => normalizeUsername(username || displayName),
    [displayName, username],
  );

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      const response = await fetch("/api/academy-student-profile", {
        cache: "no-store",
        credentials: "include",
      }).catch(() => null);
      const data = response ? ((await response.json().catch(() => null)) as ProfileResponse | null) : null;
      if (!active) return;
      const state = resolveAcademyProfileReadState<NonNullable<ProfileResponse["profile"]>>(response, data);
      if (state.status === "unavailable") {
        setProfileStatus("unavailable");
        return;
      }
      if (state.status === "unauthenticated") {
        setProfileStatus("unauthenticated");
        return;
      }
      if (state.profile) {
        setEmail(state.profile.email || "");
        setPhone(state.profile.phone || "");
        setPublicStudentId(state.profile.public_student_id || "");
        setBirthDate(dateInputValue(state.profile.birth_date));
        setGender(state.profile.gender || "");
        setCountry(state.profile.country || "");
      }
      if (state.profile?.display_name) {
        setExistingProfile(true);
        setDisplayName(state.profile.display_name);
        setUsername(state.profile.username || "");
        setAvatar(state.profile.avatar || avatarOptions[0]);
        setPhotoUrl(state.profile.photo_url || null);
        setGoal(state.profile.learning_goal || (locale === "fa" ? goalsFa[0] : goalsEn[0]));
      }
      setProfileStatus("ready");
    }
    void loadProfile();
    return () => { active = false; };
  }, [locale, retryVersion]);

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (!existingProfile) {
      setError(isFa ? "ابتدا پروفایل را بساز؛ سپس می‌توانی عکس شخصی بارگذاری کنی." : "Create your profile first, then upload a personal photo.");
      return;
    }
    if (!PHOTO_TYPES.has(file.type) || file.size < 1 || file.size > MAX_AVATAR_BYTES) {
      setError(isFa ? "عکس باید JPG، PNG یا WebP و حداکثر ۲ مگابایت باشد." : "Photo must be JPG, PNG or WebP and at most 2 MB.");
      return;
    }
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.set("avatar", file);
      const response = await fetch("/api/academy-profile-avatar", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.avatar !== "string") {
        throw new Error(data?.error || "upload_failed");
      }
      setPhotoUrl(data.avatar);
    } catch {
      setError(isFa ? "بارگذاری عکس انجام نشد. دوباره تلاش کن." : "Photo upload failed. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function submit() {
    setError("");
    const cleanDisplay = displayName.trim().slice(0, 60);
    const cleanUser = normalizeUsername(username || displayName);
    if (cleanDisplay.length < 2) {
      setError(isFa ? "نام نمایشی باید حداقل ۲ حرف باشد." : "Display name must be at least 2 characters.");
      return;
    }
    if (cleanUser.length < 3) {
      setError(isFa ? "نام کاربری باید حداقل ۳ کاراکتر انگلیسی باشد." : "Username must be at least 3 English characters.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/academy-student-profile", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: cleanDisplay,
          username: cleanUser,
          avatar,
          photoUrl,
          learningGoal: goal,
          birthDate: birthDate || null,
          gender: gender || null,
          country: country.trim() || null,
          locale,
          source: existingProfile ? "academy-profile-editor" : "academy-onboarding",
        }),
      });
      if (response.status === 401) {
        setProfileStatus("unauthenticated");
        throw new Error("login_required");
      }
      if (response.status === 503) {
        setProfileStatus("unavailable");
        throw new Error("profile_service_unavailable");
      }
      if (response.status === 409) {
        const conflict = await response.json().catch(() => null);
        setError(conflict?.error === "academy_username_unavailable"
          ? (isFa ? "این نام کاربری در دسترس نیست. نام دیگری انتخاب کن." : "This username is unavailable. Choose another one.")
          : (isFa ? "اتصال پروفایل نیاز به بررسی دارد. با پشتیبانی تماس بگیر." : "Your profile connection needs review. Contact support."));
        return;
      }
      if (!response.ok) throw new Error("save_failed");
      window.dispatchEvent(new Event("tecpey-academy-profile-ready"));
      router.push(locale === "en" ? "/en/academy/profile" : "/academy/profile");
      router.refresh();
    } catch (err) {
      if ((err as Error)?.message === "profile_service_unavailable") return;
      setError((err as Error)?.message === "login_required"
        ? (isFa ? "برای ذخیره پروفایل ابتدا وارد حساب آکادمی شو." : "Log in to your Academy account before saving your profile.")
        : (isFa ? "ذخیره پروفایل انجام نشد. اطلاعات را بررسی و دوباره تلاش کن." : "Profile could not be saved. Review the information and try again."));
    } finally {
      setSaving(false);
    }
  }

  if (profileStatus === "loading") {
    return <main className="min-h-screen bg-slate-950 px-4 py-16 text-white"><div className="mx-auto max-w-3xl rounded-[32px] border border-cyan-300/20 bg-white/[0.055] p-8 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" /><p className="mt-4 font-black">{isFa ? "در حال دریافت پروفایل…" : "Loading profile…"}</p></div></main>;
  }

  if (profileStatus === "unavailable") {
    return <AcademyProfileUnavailableState locale={locale} onRetry={() => { setProfileStatus("loading"); setRetryVersion((value) => value + 1); }} />;
  }

  if (profileStatus === "unauthenticated") {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-16 text-white" dir={isFa ? "rtl" : "ltr"}>
        <section className="mx-auto max-w-2xl rounded-[32px] border border-cyan-300/20 bg-white/[0.05] p-8 text-center">
          <UserRoundCheck className="mx-auto h-12 w-12 text-cyan-200" />
          <h1 className="mt-4 text-3xl font-black">{isFa ? "ابتدا وارد حساب آکادمی شو" : "Log in to Academy first"}</h1>
          <Link href={isFa ? "/academy/login" : "/en/academy/login"} className="mt-6 inline-flex rounded-2xl bg-cyan-400 px-6 py-3 font-black text-slate-950">{isFa ? "ورود" : "Log in"}</Link>
        </section>
      </main>
    );
  }

  const backHref = existingProfile ? (isFa ? "/academy/profile" : "/en/academy/profile") : (isFa ? "/academy" : "/en/academy");
  const inputClass = "mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white outline-none ring-cyan-300/30 transition focus:ring-4 disabled:opacity-60";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,.10),transparent_28%),#020617] px-4 py-8 text-white sm:px-6 lg:px-8" dir={isFa ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-5xl">
        <Link href={backHref} className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-3 text-sm font-bold text-slate-300 focus-visible:ring-2 focus-visible:ring-cyan-300">
          <ArrowLeft className={`h-4 w-4 ${isFa ? "rotate-180" : ""}`} />
          {isFa ? "بازگشت" : "Back"}
        </Link>

        <header className="mt-4">
          <p className="text-sm font-black text-cyan-200">{isFa ? "هویت آموزشی خصوصی" : "Private learning identity"}</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">{isFa ? (existingProfile ? "ویرایش پروفایل" : "ساخت پروفایل") : (existingProfile ? "Edit profile" : "Create profile")}</h1>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-7 text-slate-400">{isFa ? "عکس، تاریخ تولد، جنسیت و کشور خصوصی هستند. ایمیل و شماره موبایل از حساب تأییدشده می‌آیند و از این فرم قابل تغییر نیستند." : "Photo, birth date, gender and country are private. Email and mobile come from your verified account and cannot be changed in this form."}</p>
        </header>

        <form onSubmit={(event) => { event.preventDefault(); if (!saving && !uploadingPhoto) void submit(); }} aria-busy={saving || uploadingPhoto} className="mt-7 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="h-fit rounded-[28px] border border-white/10 bg-white/[0.045] p-5 lg:sticky lg:top-28">
            <div className="mx-auto grid h-28 w-28 place-items-center overflow-hidden rounded-[32px] border border-cyan-300/25 bg-cyan-400/10 text-5xl shadow-[0_20px_55px_rgba(34,211,238,.12)]">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- #619: authenticated user photo is served by the governed same-origin avatar endpoint.
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              ) : avatar}
            </div>
            <p className="mt-4 text-center text-lg font-black">{displayName.trim() || (isFa ? "نام تو" : "Your name")}</p>
            <p className="mt-1 text-center text-xs font-bold text-slate-400"><bdi>@{usernameHint || "username"}</bdi></p>
            {publicStudentId ? <p className="mt-2 text-center text-[11px] font-bold text-cyan-200"><bdi>{publicStudentId}</bdi></p> : null}

            <label className={`mt-5 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 ${!existingProfile || uploadingPhoto ? "pointer-events-none opacity-50" : ""}`}>
              {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {isFa ? "بارگذاری عکس شخصی" : "Upload personal photo"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!existingProfile || uploadingPhoto || saving} onChange={(event) => void uploadPhoto(event)} />
            </label>
            <p className="mt-2 text-center text-[11px] leading-5 text-slate-500">JPG / PNG / WebP · max 2 MB</p>
            {photoUrl ? <button type="button" onClick={() => setPhotoUrl(null)} disabled={saving || uploadingPhoto} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-black text-rose-300 hover:bg-rose-400/10"><Trash2 className="h-4 w-4" />{isFa ? "حذف عکس" : "Remove photo"}</button> : null}

            <p className="mt-5 text-xs font-black text-slate-300">{isFa ? "آواتار عمومی" : "Public avatar"}</p>
            <div role="group" aria-label={isFa ? "انتخاب آواتار عمومی" : "Choose public avatar"} className="mt-2 grid grid-cols-4 gap-2">
              {avatarOptions.map((item) => <button key={item} type="button" aria-pressed={avatar === item} onClick={() => setAvatar(item)} disabled={saving} className={`grid min-h-10 place-items-center rounded-xl border text-lg ${avatar === item ? "border-cyan-300 bg-cyan-300/20" : "border-white/10 bg-white/5"}`}>{item}</button>)}
            </div>
          </aside>

          <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 sm:p-7">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-black">{isFa ? "نام نمایشی" : "Display name"}<input autoComplete="nickname" maxLength={60} disabled={saving} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={inputClass} /></label>
              <label className="text-sm font-black">{isFa ? "نام کاربری" : "Username"}<input autoComplete="username" autoCapitalize="none" spellCheck={false} dir="ltr" disabled={saving} value={username} onChange={(event) => setUsername(normalizeUsername(event.target.value))} className={`${inputClass} text-left`} /></label>

              <label className="text-sm font-black">{isFa ? "ایمیل تأییدشده" : "Verified email"}<input readOnly value={email || (isFa ? "ثبت نشده" : "Not available")} dir="ltr" className={`${inputClass} cursor-not-allowed text-left text-slate-400`} /></label>
              <label className="text-sm font-black">{isFa ? "شماره موبایل تأییدشده" : "Verified mobile"}<input readOnly value={phone || (isFa ? "ثبت نشده" : "Not available")} dir="ltr" className={`${inputClass} cursor-not-allowed text-left text-slate-400`} /></label>

              <label className="text-sm font-black">{isFa ? "تاریخ تولد" : "Birth date"}<input type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} disabled={saving} value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className={inputClass} /></label>
              <label className="text-sm font-black">{isFa ? "جنسیت (اختیاری)" : "Gender (optional)"}<select disabled={saving} value={gender} onChange={(event) => setGender(event.target.value)} className={`${inputClass} bg-slate-900`}><option value="">{isFa ? "انتخاب نشده" : "Not specified"}</option><option value="female">{isFa ? "زن" : "Female"}</option><option value="male">{isFa ? "مرد" : "Male"}</option><option value="nonbinary">{isFa ? "غیردودویی" : "Non-binary"}</option><option value="prefer_not_to_say">{isFa ? "ترجیح می‌دهم نگویم" : "Prefer not to say"}</option></select></label>

              <label className="text-sm font-black">{isFa ? "کشور" : "Country"}<input maxLength={80} autoComplete="country-name" disabled={saving} value={country} onChange={(event) => setCountry(event.target.value)} className={inputClass} /></label>
              <label className="text-sm font-black">{isFa ? "هدف فعلی یادگیری" : "Current learning goal"}<select disabled={saving} value={goal} onChange={(event) => setGoal(event.target.value)} className={`${inputClass} bg-slate-900`}>{!(isFa ? goalsFa : goalsEn).includes(goal) ? <option value={goal}>{goal}</option> : null}{(isFa ? goalsFa : goalsEn).map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>

            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-xs font-bold leading-6 text-emerald-100"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{isFa ? "ایمیل و موبایل فقط از هویت تأییدشده خوانده می‌شوند. تغییر این دو مورد نیازمند فرایند مستقل تأیید هویت حساب است و این فرم هرگز آن‌ها را overwrite نمی‌کند." : "Email and mobile are read only from verified identity. Changing either requires a separate account-verification flow; this form never overwrites them."}</div>

            {error ? <p role="alert" className="mt-5 rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-xs font-black leading-6 text-rose-100">{error}</p> : null}
            <button type="submit" disabled={saving || uploadingPhoto} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-6 py-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {saving ? (isFa ? "در حال ذخیره…" : "Saving…") : existingProfile ? (isFa ? "ذخیره تغییرات" : "Save changes") : (isFa ? "ساخت پروفایل و ورود به داشبورد" : "Create profile and enter dashboard")}
            </button>
          </section>
        </form>
      </div>
    </main>
  );
}
