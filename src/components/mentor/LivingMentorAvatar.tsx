import Image from "next/image";
import {
  LIVING_MENTOR_ACTS,
  type LivingMentorAct,
} from "@/lib/living-mentor-presentation";
import styles from "./LivingMentorAvatar.module.css";

export { LIVING_MENTOR_ACTS };
export type { LivingMentorAct };

type LivingMentorAvatarProps = {
  act?: LivingMentorAct;
  accessibleLabel?: string;
  className?: string;
  decorative?: boolean;
  locale?: string;
  size?: "launcher" | "header" | "stage";
};

const ACT_LABELS: Record<LivingMentorAct, { en: string; fa: string }> = {
  idle_attentive: { en: "ready to help", fa: "آماده همراهی" },
  greet: { en: "welcoming you", fa: "خوش‌آمدگویی" },
  listen: { en: "listening", fa: "در حال شنیدن" },
  think: { en: "thinking", fa: "در حال بررسی" },
  explain: { en: "explaining", fa: "در حال توضیح" },
  invite_next_step: { en: "ready for the next step", fa: "آماده قدم بعد" },
  celebrate_effort: { en: "recognizing your effort", fa: "قدردانی از تلاش شما" },
  encourage_retry: { en: "ready to try again", fa: "آماده تلاش دوباره" },
  pause_reflect: { en: "pausing to reflect", fa: "مکث برای بازنگری" },
  risk_caution: { en: "risk review", fa: "مرور ریسک" },
  privacy_notice: { en: "privacy notice", fa: "یادآوری حریم خصوصی" },
  data_unavailable: { en: "data unavailable", fa: "داده در دسترس نیست" },
  error_recover: { en: "recovering safely", fa: "بازیابی امن" },
};

/**
 * Phase-1 static renderer for the Living Mentor.
 *
 * The host-facing `act` vocabulary intentionally matches the governed Rive
 * contract. Once the signed `.riv` asset is available, the image inside this
 * boundary can be replaced by a lazy runtime renderer without changing callers
 * or exposing learning evidence to the character asset.
 */
export function LivingMentorAvatar({
  act = "idle_attentive",
  accessibleLabel,
  className = "",
  decorative = false,
  locale = "fa",
  size = "header",
}: LivingMentorAvatarProps) {
  const fallbackLabel = locale.toLowerCase().startsWith("fa")
    ? `منتور تک‌پی، ${ACT_LABELS[act].fa}`
    : `TecPey Mentor, ${ACT_LABELS[act].en}`;

  return (
    <span
      className={`${styles.root} ${styles[size]} ${className}`.trim()}
      data-mentor-act={act}
      data-rive-contract="tecpey-mentor-rive-viewmodel.v1"
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : accessibleLabel || fallbackLabel}
      role={decorative ? undefined : "img"}
    >
      <span className={styles.halo} aria-hidden="true" />
      <span className={styles.frame} aria-hidden="true">
        <Image
          src="/images/mentor/tecpey-living-mentor-v1.webp"
          alt=""
          fill
          sizes={size === "stage" ? "88px" : size === "launcher" ? "36px" : "42px"}
          className={styles.portrait}
        />
      </span>
      <span className={styles.status} aria-hidden="true" />
    </span>
  );
}
