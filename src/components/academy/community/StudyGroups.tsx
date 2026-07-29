"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Info, Lock, Users } from "lucide-react";
import {
  loadCommunityProfile,
  addGroupInterest,
  removeGroupInterest,
  updatePrivacy,
  type CommunityProfile,
} from "@/lib/community-profile";
import { STUDY_GROUPS, LEVEL_LABEL, type StudyGroup } from "@/lib/community-groups";

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({
  group,
  joined,
  privacyOk,
  onJoin,
  onLeave,
}: {
  group: StudyGroup;
  joined: boolean;
  privacyOk: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const LEVEL_COLOR = { beginner: "text-emerald-300", intermediate: "text-amber-300", advanced: "text-red-300" };
  const disciplineColor = group.disciplineScore >= 80 ? "text-emerald-300" : group.disciplineScore >= 60 ? "text-amber-300" : "text-red-300";

  return (
    <div className={`rounded-[24px] border p-5 transition-all ${joined ? "border-cyan-300/30 bg-cyan-400/5" : "border-white/10 bg-slate-900/60"}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-black ${LEVEL_COLOR[group.level]}`}>{LEVEL_LABEL[group.level]}</span>
            <span className="text-xs font-bold text-slate-600">·</span>
            <span className="text-xs font-bold text-slate-500">{group.memberCount} عضو</span>
            <span className="rounded-sm bg-slate-700 px-1 py-0.5 text-[9px] font-bold text-slate-500">نمایشی</span>
          </div>
          <h3 className="font-black">{group.name}</h3>
        </div>
        <div className="text-right">
          <p className={`text-lg font-black ${disciplineColor}`}>{group.disciplineScore}</p>
          <p className="text-[10px] font-bold text-slate-600">انضباط گروه</p>
        </div>
      </div>

      <p className="text-sm font-bold leading-6 text-slate-400 mb-3">{group.description}</p>

      <div className="space-y-2 mb-4">
        <div className="rounded-xl bg-slate-800/60 p-2.5">
          <p className="text-xs font-bold text-slate-500">تمرکز: <span className="text-slate-300">{group.focusTopic}</span></p>
        </div>
        <div className="rounded-xl bg-slate-800/60 p-2.5">
          <p className="text-xs font-bold text-slate-500">هدف هفتگی: <span className="text-slate-300">{group.weeklyGoal}</span></p>
        </div>
        <div className="rounded-xl bg-violet-400/5 border border-violet-400/10 p-2.5">
          <p className="text-xs font-bold text-slate-500">چالش گروه: <span className="text-violet-200">{group.groupChallenge}</span></p>
        </div>
      </div>

      {!privacyOk ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800/40 p-3">
          <Lock className="h-4 w-4 text-slate-600 shrink-0" />
          <p className="text-xs font-bold text-slate-600">برای ابراز علاقه، تنظیم «علاقه به گروه مطالعاتی» را فعال کنید.</p>
        </div>
      ) : joined ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-300" />
            <span className="text-sm font-black text-emerald-200">علاقه‌مند هستید</span>
          </div>
          <button
            onClick={onLeave}
            className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-black text-slate-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            لغو
          </button>
        </div>
      ) : (
        <button
          onClick={onJoin}
          className="w-full rounded-2xl border border-cyan-300/20 bg-cyan-400/5 py-2.5 text-sm font-black text-cyan-200 hover:bg-cyan-400/10 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          aria-label={`ابراز علاقه به گروه ${group.name}`}
        >
          ابراز علاقه به پیوستن
        </button>
      )}
    </div>
  );
}

// ─── Privacy gate ─────────────────────────────────────────────────────────────

function PrivacyGate({ profile, onEnable }: { profile: CommunityProfile; onEnable: (p: CommunityProfile) => void }) {
  if (profile.privacy.studyGroupInterest) return null;
  return (
    <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-5">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="flex-1">
          <p className="font-black text-amber-200 mb-1">مشارکت در گروه‌ها خصوصی است</p>
          <p className="text-sm font-bold leading-7 text-slate-400 mb-3">
            برای ابراز علاقه به گروه‌های مطالعاتی، این گزینه را فعال کنید. اطلاعات خصوصی شما هرگز به اشتراک گذاشته نمی‌شود.
          </p>
          <button
            onClick={() => onEnable(updatePrivacy(profile, { studyGroupInterest: true }))}
            className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-black text-amber-200 hover:bg-amber-400/20 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            فعال کردن علاقه گروه‌ها
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main StudyGroups ─────────────────────────────────────────────────────────

export function StudyGroups() {
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProfile(loadCommunityProfile());
    setLoaded(true);
  }, []);

  const handleJoin = (group: StudyGroup) => {
    if (!profile) return;
    setProfile(addGroupInterest(profile, group.id));
  };

  const handleLeave = (group: StudyGroup) => {
    if (!profile) return;
    setProfile(removeGroupInterest(profile, group.id));
  };

  if (!loaded) return <div className="flex h-64 items-center justify-center text-sm font-bold text-slate-500">در حال بارگذاری...</div>;

  const privacyOk = profile?.privacy.studyGroupInterest ?? false;
  const interestCount = profile?.groupInterests.length ?? 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black">گروه‌های مطالعاتی</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">یادگیری گروهی — بدون چت، بدون فشار</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-400/10">
          <Users className="h-6 w-6 text-violet-300" />
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5">
        <Info className="h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs font-bold text-amber-200">گروه‌ها فقط برای یادگیری مشترک هستند. هیچ چت یا پیام خصوصی‌ای وجود ندارد.</p>
      </div>

      {!profile ? (
        <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-6 text-center">
          <Lock className="mx-auto h-8 w-8 text-amber-300 mb-3" />
          <p className="font-black text-amber-200">پروفایل جامعه لازم است</p>
          <p className="mt-2 text-sm font-bold text-slate-400">ابتدا از صفحه اصلی جامعه پروفایل بسازید.</p>
        </div>
      ) : (
        <>
          {interestCount > 0 && (
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4">
              <p className="text-xs font-black text-cyan-300">
                شما به {interestCount} گروه ابراز علاقه کرده‌اید.
                وقتی backend فعال شد، درخواست عضویت ارسال می‌شود.
              </p>
            </div>
          )}

          <PrivacyGate profile={profile} onEnable={setProfile} />
        </>
      )}

      {/* Group cards */}
      <div className="space-y-4">
        {STUDY_GROUPS.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            joined={profile?.groupInterests.includes(group.id) ?? false}
            privacyOk={!!profile && privacyOk}
            onJoin={() => handleJoin(group)}
            onLeave={() => handleLeave(group)}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 text-center">
        <p className="text-xs font-bold text-slate-600">
          گروه‌های مطالعاتی در فاز بعدی به backend متصل می‌شوند.
          علاقه‌مندی‌های شما ذخیره شده و هنگام راه‌اندازی منتقل می‌شوند.
        </p>
      </div>
    </div>
  );
}
