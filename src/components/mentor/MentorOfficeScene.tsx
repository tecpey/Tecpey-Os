"use client";

import Image from "next/image";
import {
  Award,
  BookOpenCheck,
  Crown,
  Globe2,
  GraduationCap,
  LockKeyhole,
  Medal,
  MessagesSquare,
  Monitor,
  Search,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import type { LivingMentorAct } from "./LivingMentorAvatar";
import type {
  MentorGazeTarget,
  MentorSceneFraming,
  MentorSpatialPose,
  MentorStageIntensity,
  MentorWorkspaceMode,
} from "@/lib/mentor-stage-director";
import {
  MENTOR_WORKSPACE_SURFACES,
  canUseMentorWorkspaceSurface,
  mentorWorkspaceEntitlements,
  type MentorWorkspacePlan,
  type MentorWorkspaceSurface,
} from "@/lib/mentor-workspace";
import styles from "./MentorOfficeScene.module.css";

type MentorOfficeStatus =
  | "idle"
  | "listening"
  | "thinking"
  | "researching"
  | "explaining";

type MentorOfficeSceneProps = {
  activeSurface: MentorWorkspaceSurface;
  completedTerms: number;
  confidence: number | null;
  framing: MentorSceneFraming;
  gaze: MentorGazeTarget;
  intensity: MentorStageIntensity;
  locale?: string;
  mentorAct: LivingMentorAct;
  mode: MentorWorkspaceMode;
  motion: "full" | "reduced";
  onSelectSurface: (surface: MentorWorkspaceSurface) => void;
  plan: MentorWorkspacePlan;
  pose: MentorSpatialPose;
  status: MentorOfficeStatus;
};

const COPY = {
  fa: {
    academy: "میز آموزش",
    web_research: "پژوهش وب",
    social_research: "پژوهش سوشال",
    free: "فضای پایه",
    premium: "دفتر پرمیوم",
    locked: "ویژه پرمیوم",
    office: "دفتر شخصی منتور تک‌پی",
    safe: "مسیر امن و آموزشی",
    sources: "منابع در حال بررسی",
    social: "رصد فضای عمومی X و شبکه‌های اجتماعی",
    lesson: "درس، تمرین و قدم بعدی",
    idle: "آماده همراهی",
    listening: "در حال شنیدن سؤال",
    thinking: "در حال بررسی آموزشی",
    researching: "در حال پژوهش منبع‌دار",
    explaining: "در حال تنظیم پاسخ",
    credential: "دستاورد آموزشی",
    nextCredential: "جای دستاورد بعدی",
    term: "ترم",
    confidence: "اعتماد آموزشی",
    switcher: "نمایشگر فعال",
    arena_coach: "همراهی چالش Arena",
    challenge_invite: "پیشنهاد تمرین کنترل‌شده",
    conversation: "همراهی در گفت‌وگو",
    news_briefing: "مرور خبر با کنترل منبع",
    research: "پژوهش منبع‌دار",
  },
  en: {
    academy: "Learning desk",
    web_research: "Web research",
    social_research: "Social research",
    free: "Core workspace",
    premium: "Premium office",
    locked: "Premium only",
    office: "TecPey Mentor personal office",
    safe: "Safe, education-first guidance",
    sources: "Reviewing public sources",
    social: "Scanning public X and social sources",
    lesson: "Lesson, practice and next step",
    idle: "Ready to help",
    listening: "Listening to your question",
    thinking: "Reviewing the learning context",
    researching: "Running source-backed research",
    explaining: "Preparing the explanation",
    credential: "Learning achievement",
    nextCredential: "Next achievement space",
    term: "Term",
    confidence: "Learning confidence",
    switcher: "Active monitor",
    arena_coach: "Coaching the Arena challenge",
    challenge_invite: "Offering a controlled practice step",
    conversation: "In conversation",
    news_briefing: "Reviewing evidence-backed news",
    research: "Source-backed research",
  },
} as const;

function SurfaceIcon({ surface }: { surface: MentorWorkspaceSurface }) {
  if (surface === "web_research") return <Globe2 aria-hidden="true" />;
  if (surface === "social_research") return <MessagesSquare aria-hidden="true" />;
  return <BookOpenCheck aria-hidden="true" />;
}

export function MentorOfficeScene({
  activeSurface,
  completedTerms,
  confidence,
  framing,
  gaze,
  intensity,
  locale = "fa",
  mentorAct,
  mode,
  motion,
  onSelectSurface,
  plan,
  pose,
  status,
}: MentorOfficeSceneProps) {
  const isFa = locale.toLowerCase().startsWith("fa");
  const copy = isFa ? COPY.fa : COPY.en;
  const entitlements = mentorWorkspaceEntitlements(plan);
  const statusLabel =
    status === "idle" && mode !== "conversation" ? copy[mode] : copy[status];
  const recentCredentials = Array.from(
    { length: Math.min(2, completedTerms) },
    (_, index) => completedTerms - index,
  );

  const monitorText =
    activeSurface === "social_research"
      ? copy.social
      : activeSurface === "web_research"
        ? copy.sources
        : copy.lesson;
  const mentorPoseSource =
    pose === "standing_arena"
      ? "/images/mentor/tecpey-mentor-standing-arena-v1.webp"
      : pose === "standing_user"
        ? "/images/mentor/tecpey-mentor-standing-user-v1.webp"
        : "/images/mentor/tecpey-mentor-office-pose-v1.webp";
  const standing = pose === "standing_arena" || pose === "standing_user";

  return (
    <section
      className={styles.scene}
      data-plan={plan}
      data-status={status}
      data-framing={framing}
      data-gaze={gaze}
      data-intensity={intensity}
      data-mode={mode}
      data-motion={motion}
      data-pose={pose}
      data-rive-surface="MentorScene"
      data-static-fallback="true"
      aria-label={copy.office}
    >
      <div className={styles.ambient} aria-hidden="true" />

      <header className={styles.sceneHeader}>
        <div>
          <p className={styles.sceneEyebrow}>{copy.office}</p>
          <p className={styles.sceneStatus} aria-live="polite">
            <span className={styles.statusDot} aria-hidden="true" />
            {statusLabel}
          </p>
        </div>
        <span className={styles.planBadge} data-plan={plan}>
          {plan === "premium" ? <Crown aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          {plan === "premium" ? copy.premium : copy.free}
        </span>
      </header>

      <div className={styles.credentials} aria-label={isFa ? "دستاوردهای منتور" : "Mentor achievements"}>
        {recentCredentials.length ? (
          recentCredentials.map((term) => (
            <div className={styles.credentialFrame} key={term}>
              <GraduationCap aria-hidden="true" />
              <span>{copy.credential}</span>
              <strong>{copy.term} {term}</strong>
            </div>
          ))
        ) : (
          <div className={`${styles.credentialFrame} ${styles.credentialEmpty}`}>
            <GraduationCap aria-hidden="true" />
            <span>{copy.nextCredential}</span>
          </div>
        )}
      </div>

      <div className={styles.awardShelf} aria-label={isFa ? "نشان‌های مسیر" : "Path awards"}>
        <span data-earned={completedTerms >= 1}><Medal aria-hidden="true" /></span>
        <span data-earned={completedTerms >= 3}><Trophy aria-hidden="true" /></span>
        <span data-earned={completedTerms >= 7}><Award aria-hidden="true" /></span>
      </div>

      <div className={styles.monitorBank} aria-label={copy.switcher}>
        <div className={`${styles.monitor} ${styles.secondaryMonitor} ${styles.monitorLeft}`}>
          <div className={styles.screen}>
            <Globe2 aria-hidden="true" />
            <span>{copy.web_research}</span>
            <small>{copy.sources}</small>
          </div>
          <span className={styles.monitorStand} aria-hidden="true" />
        </div>

        <div className={`${styles.monitor} ${styles.primaryMonitor}`}>
          <div className={`${styles.screen} ${styles.screenActive}`}>
            <SurfaceIcon surface={activeSurface} />
            <span>{copy[activeSurface]}</span>
            <small>{monitorText}</small>
            <div className={styles.screenMetric}>
              <span>{copy.confidence}</span>
              <strong>{confidence === null ? "—" : `${Math.round(confidence)}%`}</strong>
            </div>
          </div>
          <span className={styles.monitorStand} aria-hidden="true" />
        </div>

        <div className={`${styles.monitor} ${styles.secondaryMonitor} ${styles.monitorRight}`}>
          <div className={styles.screen}>
            <MessagesSquare aria-hidden="true" />
            <span>{copy.social_research}</span>
            <small>{copy.social}</small>
          </div>
          <span className={styles.monitorStand} aria-hidden="true" />
        </div>
      </div>

      <div
        className={styles.mentorStation}
        data-mentor-act={mentorAct}
        data-mentor-gaze={gaze}
        data-mentor-pose={pose}
        data-rive-contract="tecpey-mentor-rive-viewmodel.v1"
        aria-hidden="true"
      >
        <Image
          key={mentorPoseSource}
          src={mentorPoseSource}
          alt=""
          fill
          sizes={standing
            ? "(max-width: 640px) 150px, (max-width: 1179px) 210px, 270px"
            : "(max-width: 640px) 132px, (max-width: 1179px) 190px, 206px"}
          className={styles.officeMentorPose}
        />
      </div>

      <div className={styles.desk} aria-hidden="true">
        <span className={styles.deskEdge} />
        <span className={styles.deskPlaque}>TECPey</span>
      </div>

      <div className={styles.surfaceSwitcher}>
        {MENTOR_WORKSPACE_SURFACES.map((surface) => {
          const available = canUseMentorWorkspaceSurface(plan, surface.id);
          const selected = activeSurface === surface.id;
          return (
            <button
              key={surface.id}
              type="button"
              aria-pressed={selected}
              aria-label={available ? copy[surface.id] : `${copy[surface.id]}، ${copy.locked}`}
              disabled={!available}
              onClick={() => onSelectSurface(surface.id)}
              className={styles.surfaceButton}
              data-active={selected}
              data-locked={!available}
            >
              {available ? <SurfaceIcon surface={surface.id} /> : <LockKeyhole aria-hidden="true" />}
              <span>{copy[surface.id]}</span>
            </button>
          );
        })}
      </div>

      <footer className={styles.sceneFooter}>
        <Monitor aria-hidden="true" />
        <span>{entitlements.monitorCount} {isFa ? "نمایشگر فعال" : entitlements.monitorCount === 1 ? "active monitor" : "active monitors"}</span>
        <span className={styles.footerDivider} aria-hidden="true" />
        <Search aria-hidden="true" />
        <span>{copy.safe}</span>
      </footer>
    </section>
  );
}
