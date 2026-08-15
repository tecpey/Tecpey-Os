"use client";

import Link from "next/link";
import { CalendarDays, CheckCircle2, EyeOff, Globe2, History, Lock, QrCode, Share2, ShieldCheck, Sparkles, Trophy, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Locale = "fa" | "en";
type Achievement = {
  code: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  xp: number;
  earned: boolean;
  earnedAt?: string | null;
};
type GovernedCredential = {
  id: string;
  public_id: string | null;
  code: string;
  credential_type: string;
  title_fa: string;
  title_en: string;
  description_fa: string;
  description_en: string;
  issued_at: string;
  lifecycle_state: string;
  lifecycle_reason?: string | null;
  lifecycle_changed_at?: string | null;
  rank?: number | null;
  season_key?: string | null;
  expires_at?: string | null;
  visibility: "private" | "profile" | "public";
  visibility_changed_at?: string | null;
};
type CredentialHistoryEvent = {
  credential_id: string;
  event_kind: "lifecycle" | "visibility";
  state: string;
  reason: string;
  actor_type: string;
  occurred_at: string;
};
type PublicProfileState = {
  publicProfileId: string;
  visibility: "private" | "public";
};

export function AchievementCenter({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const [items, setItems] = useState<Achievement[]>([]);
  const [credentials, setCredentials] = useState<GovernedCredential[]>([]);
  const [credentialHistory, setCredentialHistory] = useState<CredentialHistoryEvent[]>([]);
  const [publicProfile, setPublicProfile] = useState<PublicProfileState | null>(null);
  const [authorityNow, setAuthorityNow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingCredentialId, setSavingCredentialId] = useState<string | null>(null);
  const [visibilityMessage, setVisibilityMessage] = useState<string | null>(null);
  // The API answers 200 with placeholder badges when its storage is unreachable.
  // Without this flag the page would present that placeholder set as the
  // student's real record.
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    let active = true;
    let clockTimer: number | null = null;
    Promise.all([
      fetch(`/api/achievements?locale=${locale}`, { cache: "no-store", credentials: "include" }).then((res) => res.json()),
      fetch("/api/community/profile", { cache: "no-store", credentials: "include" }).then((res) => res.ok ? res.json() : null).catch(() => null),
    ])
      .then(([data, profileData]) => {
        if (!active) return;
        setItems(Array.isArray(data?.achievements) ? data.achievements : []);
        setCredentials(Array.isArray(data?.credentials) ? data.credentials : []);
        setCredentialHistory(Array.isArray(data?.credentialHistory) ? data.credentialHistory : []);
        const receivedAt = Date.now();
        const serverNow = Date.parse(String(data?.authorityTime ?? ""));
        if (Number.isFinite(serverNow)) {
          const authorityOffset = serverNow - receivedAt;
          setAuthorityNow(serverNow);
          clockTimer = window.setInterval(() => {
            setAuthorityNow(Date.now() + authorityOffset);
          }, 30_000);
        }
        setPublicProfile(profileData?.profile ? {
          publicProfileId: String(profileData.profile.publicProfileId ?? ""),
          visibility: profileData.profile.visibility === "public" ? "public" : "private",
        } : null);
        setDegraded(data?.degraded === true);
      })
      .catch(() => active && setDegraded(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      if (clockTimer !== null) window.clearInterval(clockTimer);
    };
  }, [locale]);

  const earned = useMemo(() => items.filter((item) => item.earned), [items]);
  const totalXp = earned.reduce((sum, item) => sum + Number(item.xp || 0), 0);
  const next = items.find((item) => !item.earned);
  function isActiveCredential(item: GovernedCredential) {
    return (item.lifecycle_state === "issued" || item.lifecycle_state === "reinstated") &&
      (!item.expires_at || authorityNow === 0 || Date.parse(item.expires_at) > authorityNow);
  }

  function verificationPath(item: GovernedCredential): string | null {
    if (item.visibility !== "public" || publicProfile?.visibility !== "public") return null;
    if (!/^[0-9a-f]{24}$/.test(item.public_id ?? "") ||
      !/^[A-Za-z0-9_.-]{1,64}$/.test(publicProfile.publicProfileId)) return null;
    return `/student/${encodeURIComponent(publicProfile.publicProfileId)}/credential/${item.public_id}`;
  }

  async function shareCredential(item: GovernedCredential) {
    const path = verificationPath(item);
    if (!path) return;
    const url = `${window.location.origin}${path}`;
    const title = isFa ? item.title_fa : item.title_en;
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(url);
      setVisibilityMessage(isFa ? "لینک استعلام در کلیپ‌بورد ذخیره شد." : "Verification link copied to the clipboard.");
    } catch {
      setVisibilityMessage(isFa ? "اشتراک‌گذاری ممکن نشد؛ از دکمه استعلام وارد صفحه شو و آدرس را کپی کن." : "Sharing failed. Open verification and copy the address from your browser.");
    }
  }

  async function changeVisibility(item: GovernedCredential, visibility: GovernedCredential["visibility"]) {
    if (savingCredentialId || item.visibility === visibility) return;
    setSavingCredentialId(item.id);
    setVisibilityMessage(null);
    try {
      const response = await fetch("/api/academy-credential-visibility", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `credential-visibility:${crypto.randomUUID()}` },
        body: JSON.stringify({ credentialId: item.id, visibility }),
      });
      const responseData = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseData?.error || "visibility_update_failed");
      setCredentials((current) => current.map((credential) =>
        credential.id === item.id ? { ...credential, visibility } : credential));
      if (!responseData?.replayed && responseData?.occurredAt) {
        setCredentialHistory((current) => [{
          credential_id: item.id,
          event_kind: "visibility",
          state: visibility,
          reason: "credential_cabinet",
          actor_type: "student",
          occurred_at: responseData.occurredAt,
        }, ...current]);
      }
      setVisibilityMessage(isFa ? "تنظیم نمایش با موفقیت ذخیره شد." : "Visibility setting saved.");
    } catch {
      setVisibilityMessage(isFa ? "ذخیره تنظیم نمایش انجام نشد؛ دوباره تلاش کن." : "Visibility could not be saved. Please try again.");
    } finally {
      setSavingCredentialId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,.16),transparent_34%),#020617] px-4 py-10 text-white sm:px-6 lg:px-8" dir={isFa ? "rtl" : "ltr"}>
      <section className="mx-auto max-w-7xl space-y-7">
        <div className="rounded-[38px] border border-cyan-300/20 bg-white/[0.065] p-6 shadow-[0_30px_120px_rgba(34,211,238,.13)] lg:p-8">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100"><Trophy className="h-4 w-4" /> Achievement OS</div>
              <h1 className="mt-5 text-3xl font-black sm:text-5xl">{isFa ? "نشان‌ها و دستاوردهای آکادمی" : "Academy achievements"}</h1>
              <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-300">
                {isFa ? "هر نشان فقط وقتی معتبر است که از رویداد رسمی آکادمی، آزمون، منتور، شبیه‌ساز یا مدرک ثبت شود؛ نه از داده دستی کاربر." : "Every badge is valid only when it is issued from official academy, quiz, mentor, simulator or certificate events; never from user-submitted claims."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center sm:min-w-72">
              <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4"><p className="text-3xl font-black text-cyan-200">{loading ? "…" : earned.length}</p><p className="mt-2 text-xs font-bold text-slate-400">{isFa ? "نشان فعال" : "earned badges"}</p></div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4"><p className="text-3xl font-black text-amber-200">{loading ? "…" : totalXp}</p><p className="mt-2 text-xs font-bold text-slate-400">XP</p></div>
            </div>
          </div>
        </div>

        {degraded && !loading && (
          <p role="status" className="rounded-[30px] border border-amber-300/30 bg-amber-400/10 p-5 text-sm font-black leading-7 text-amber-100">
            {isFa
              ? "ثبت دستاوردها موقتاً در دسترس نیست. آنچه می‌بینی نمونه‌ی نمایشی است، نه سابقه‌ی واقعی تو — به‌محض بازگشت سرویس، رکورد واقعی نمایش داده می‌شود."
              : "The achievement record is temporarily unavailable. What you see is a placeholder set, not your real history — your actual record returns once the service recovers."}
          </p>
        )}

        {next && (
          <section className="rounded-[34px] border border-emerald-300/20 bg-emerald-400/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black text-emerald-100">{isFa ? "نشان بعدی پیشنهادی" : "Next suggested badge"}</p>
                <h2 className="mt-2 text-2xl font-black">{next.icon} {next.title}</h2>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{next.description}</p>
              </div>
              <Link href="/academy/profile" className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white">{isFa ? "ادامه مسیر" : "Continue path"}</Link>
            </div>
          </section>
        )}

        {credentials.length > 0 && (
          <section aria-labelledby="governed-credentials-title">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-amber-200">Credential ledger</p>
                <h2 id="governed-credentials-title" className="mt-2 text-2xl font-black">{isFa ? "مدال‌ها و مدارک رسمی" : "Official medals and credentials"}</h2>
              </div>
              <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-xs font-black text-emerald-100">
                <ShieldCheck className="me-1 inline h-4 w-4" aria-hidden="true" />{isFa ? `${credentials.filter(isActiveCredential).length} رکورد فعال` : `${credentials.filter(isActiveCredential).length} active records`}
              </span>
            </div>
            <div className="mb-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><EyeOff className="h-5 w-5 text-slate-300" aria-hidden="true" /><p className="mt-2 text-xs font-black text-white">{isFa ? "خصوصی" : "Private"}</p><p className="mt-1 text-xs font-bold leading-6 text-slate-400">{isFa ? "فقط خودت در کابین خصوصی می‌بینی." : "Visible only in your private cabinet."}</p></div>
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-4"><UserRound className="h-5 w-5 text-cyan-200" aria-hidden="true" /><p className="mt-2 text-xs font-black text-white">{isFa ? "پروفایل" : "Profile"}</p><p className="mt-1 text-xs font-bold leading-6 text-slate-400">{isFa ? "در تجربه‌های داخل حساب قابل نمایش است؛ عمومی نیست." : "Visible in signed-in profile experiences; not public."}</p></div>
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/5 p-4"><Globe2 className="h-5 w-5 text-emerald-200" aria-hidden="true" /><p className="mt-2 text-xs font-black text-white">{isFa ? "عمومی" : "Public"}</p><p className="mt-1 text-xs font-bold leading-6 text-slate-400">{isFa ? "فقط با رضایت تو در پروفایل عمومی و استعلام نمایش داده می‌شود." : "Shown publicly and verifiable only with your consent."}</p></div>
            </div>
            {credentials.some((item) => item.visibility === "public") && publicProfile?.visibility !== "public" ? (
              <p role="status" className="mb-5 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-bold leading-7 text-amber-100">{isFa ? "حداقل یک مدرک را عمومی کرده‌ای، اما خود پروفایل عمومی هنوز خاموش است؛ تا زمان فعال‌کردن پروفایل، لینک استعلام عمومی در دسترس نخواهد بود." : "At least one credential is public, but your public profile is still private. Verification links stay unavailable until the profile is public."}</p>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {credentials.map((item) => {
                const active = isActiveCredential(item);
                const expired = Boolean(item.expires_at && authorityNow > 0 && Date.parse(item.expires_at) <= authorityNow);
                const path = verificationPath(item);
                const history = credentialHistory.filter((event) => event.credential_id === item.id).slice(0, 6);
                const stateLabel = expired
                  ? (isFa ? "منقضی" : "Expired")
                  : item.lifecycle_state === "issued" || item.lifecycle_state === "reinstated"
                    ? (isFa ? "معتبر و فعال" : "Valid and active")
                    : item.lifecycle_state === "suspended"
                      ? (isFa ? "تعلیق‌شده" : "Suspended")
                      : item.lifecycle_state === "revoked"
                        ? (isFa ? "لغوشده" : "Revoked")
                        : item.lifecycle_state.replaceAll("_", " ");
                return (
                <article key={item.id} className={`rounded-[30px] border p-5 ${active ? "border-amber-300/30 bg-amber-300/10" : "border-white/10 bg-white/[0.04]"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-200/20 bg-slate-950/35 text-amber-200"><Trophy className="h-6 w-6" aria-hidden="true" /></span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${active ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-rose-300/25 bg-rose-300/10 text-rose-100"}`}><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{stateLabel}</span>
                  </div>
                  <h3 className="mt-4 text-xl font-black">{isFa ? item.title_fa : item.title_en}</h3>
                  <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{isFa ? item.description_fa : item.description_en}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-slate-300">
                    <span className="rounded-full border border-white/10 px-3 py-1">{item.credential_type.replaceAll("_", " ")}</span>
                    {item.rank ? <span className="rounded-full border border-amber-300/20 px-3 py-1 text-amber-100">{isFa ? `رتبه ${item.rank}` : `Rank ${item.rank}`}</span> : null}
                    {item.season_key ? <span className="rounded-full border border-white/10 px-3 py-1">{item.season_key}</span> : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-300">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{new Intl.DateTimeFormat(isFa ? "fa-IR" : "en", { dateStyle: "medium" }).format(new Date(item.issued_at))}</span>
                    {item.expires_at ? <span className="rounded-full border border-white/10 px-3 py-1.5">{isFa ? "انقضا" : "Expires"}: {new Intl.DateTimeFormat(isFa ? "fa-IR" : "en", { dateStyle: "medium" }).format(new Date(item.expires_at))}</span> : null}
                  </div>
                  <fieldset className="mt-5 border-t border-white/10 pt-4" disabled={savingCredentialId !== null}>
                    <legend className="mb-2 text-xs font-black text-slate-300">{isFa ? "نمایش این مدال" : "Show this credential"}</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {(["private", "profile", "public"] as const).map((visibility) => {
                        const labels = isFa
                          ? { private: "خصوصی", profile: "پروفایل", public: "عمومی" }
                          : { private: "Private", profile: "Profile", public: "Public" };
                        const selected = item.visibility === visibility;
                        const publicUnavailable = visibility === "public" && !active;
                        return <button key={visibility} type="button" aria-pressed={selected} disabled={savingCredentialId !== null || publicUnavailable} title={publicUnavailable ? (isFa ? "مدرک غیرفعال قابل عمومی‌سازی نیست" : "Inactive credentials cannot be public") : undefined} onClick={() => void changeVisibility(item, visibility)} className={`min-h-11 cursor-pointer rounded-xl border px-2 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-slate-950/30 text-slate-300 hover:border-white/25"}`}>{labels[visibility]}</button>;
                      })}
                    </div>
                  </fieldset>
                  {path ? <div className="mt-4 grid grid-cols-2 gap-2"><Link href={path} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 text-xs font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"><QrCode className="h-4 w-4" aria-hidden="true" />{isFa ? "QR و استعلام" : "QR & verify"}</Link><button type="button" onClick={() => void shareCredential(item)} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-300/25 px-3 text-xs font-black text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"><Share2 className="h-4 w-4" aria-hidden="true" />{isFa ? "اشتراک" : "Share"}</button></div> : null}
                  {history.length ? <details className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 p-3"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-black text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><History className="h-4 w-4" aria-hidden="true" />{isFa ? "تاریخچه وضعیت و نمایش" : "Status and visibility history"}</summary><ol className="mt-3 space-y-3 border-s border-white/10 ps-4">{history.map((event, index) => <li key={`${event.event_kind}:${event.occurred_at}:${index}`} className="text-xs font-bold leading-6 text-slate-300"><span className="font-black text-white">{event.event_kind === "visibility" ? (isFa ? "نمایش" : "Visibility") : (isFa ? "وضعیت" : "Status")}: {event.state.replaceAll("_", " ")}</span><br /><time dateTime={event.occurred_at}>{new Intl.DateTimeFormat(isFa ? "fa-IR" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurred_at))}</time></li>)}</ol></details> : null}
                </article>
              );})}
            </div>
            {visibilityMessage ? <p className="mt-4 text-sm font-bold text-slate-200" role="status" aria-live="polite">{visibilityMessage}</p> : null}
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.code} className={`rounded-[30px] border p-5 transition ${item.earned ? "border-amber-300/30 bg-amber-300/10" : "border-white/10 bg-white/[0.045] opacity-85"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-2xl">{item.icon || "🏆"}</div>
                {item.earned ? <CheckCircle2 className="h-6 w-6 text-emerald-300" /> : <Lock className="h-6 w-6 text-slate-500" />}
              </div>
              <h3 className="mt-4 text-xl font-black">{item.title}</h3>
              <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{item.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-slate-300">{item.category}</span>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">+{item.xp} XP</span>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-[34px] border border-cyan-300/20 bg-cyan-400/10 p-6">
          <div className="flex gap-3"><Sparkles className="h-6 w-6 text-cyan-200" /><p className="text-sm font-black leading-8 text-slate-200">{isFa ? "در نسخه موبایل، همین نشان‌ها به اعلان هوشمند، پروفایل عمومی و مسیر حرفه‌ای وصل می‌شوند." : "In the mobile version, these badges connect to smart notifications, public profile and career path."}</p></div>
        </section>
      </section>
    </main>
  );
}
