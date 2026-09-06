export type ContentAutomationMode =
  | "disabled"
  | "draft_only"
  | "scheduled_review"
  | "manual_review_required";

export type ContentAutomationDestination =
  | "tecpey_news"
  | "daily_news_archive"
  | "trend_intelligence"
  | "coin_pages"
  | "tool_pages"
  | "mentor_context"
  | "academy_quiz_ideas"
  | "term_8_insight_queue"
  | "telegram_post_draft"
  | "x_post_draft"
  | "linkedin_post_draft"
  | "instagram_carousel_reel_script_draft"
  | "shorts_reels_script_draft"
  | "internal_admin_alert";

export type ContentAutomationRiskLevel = "low" | "medium" | "high" | "very_high";

export type ContentAutomationDestinationPolicy = {
  readonly destination: ContentAutomationDestination;
  readonly label: string;
  readonly mode: ContentAutomationMode;
  readonly humanReviewRequired: boolean;
  readonly publicPublishing: boolean;
  readonly allowedFormats: readonly string[];
  readonly maxRiskLevelWithoutReview: ContentAutomationRiskLevel;
};

export const contentAutomationModes: readonly ContentAutomationMode[] = [
  "disabled",
  "draft_only",
  "scheduled_review",
  "manual_review_required",
] as const;

export const contentAutomationDestinationPolicies: readonly ContentAutomationDestinationPolicy[] = [
  {
    destination: "tecpey_news",
    label: "TecPey News",
    mode: "manual_review_required",
    humanReviewRequired: true,
    publicPublishing: true,
    allowedFormats: ["news_card", "daily_archive_item"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "daily_news_archive",
    label: "Daily News Archive",
    mode: "manual_review_required",
    humanReviewRequired: true,
    publicPublishing: true,
    allowedFormats: ["archive_item"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "trend_intelligence",
    label: "Trend Intelligence",
    mode: "manual_review_required",
    humanReviewRequired: true,
    publicPublishing: true,
    allowedFormats: ["trend_card", "watchlist_item"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "coin_pages",
    label: "Coin pages",
    mode: "manual_review_required",
    humanReviewRequired: true,
    publicPublishing: true,
    allowedFormats: ["coin_context", "risk_note", "news_link"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "tool_pages",
    label: "Tool pages",
    mode: "manual_review_required",
    humanReviewRequired: true,
    publicPublishing: true,
    allowedFormats: ["tool_context", "how_it_works", "risk_note"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "mentor_context",
    label: "Mentor context",
    mode: "draft_only",
    humanReviewRequired: true,
    publicPublishing: false,
    allowedFormats: ["verified_summary", "learning_prompt", "risk_vocabulary"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "academy_quiz_ideas",
    label: "Academy quiz ideas",
    mode: "draft_only",
    humanReviewRequired: true,
    publicPublishing: false,
    allowedFormats: ["quiz_idea", "explanation_seed"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "term_8_insight_queue",
    label: "Term 8 Infinite Growth insight queue",
    mode: "draft_only",
    humanReviewRequired: true,
    publicPublishing: false,
    allowedFormats: ["insight_card", "scenario_draft", "challenge_draft"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "telegram_post_draft",
    label: "Telegram post draft",
    mode: "draft_only",
    humanReviewRequired: true,
    publicPublishing: false,
    allowedFormats: ["short_post", "thread_outline"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "x_post_draft",
    label: "X post draft",
    mode: "draft_only",
    humanReviewRequired: true,
    publicPublishing: false,
    allowedFormats: ["short_post", "thread_outline"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "linkedin_post_draft",
    label: "LinkedIn post draft",
    mode: "draft_only",
    humanReviewRequired: true,
    publicPublishing: false,
    allowedFormats: ["professional_post", "carousel_outline"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "instagram_carousel_reel_script_draft",
    label: "Instagram carousel/reel script draft",
    mode: "draft_only",
    humanReviewRequired: true,
    publicPublishing: false,
    allowedFormats: ["carousel_outline", "reel_script", "story_sequence"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "shorts_reels_script_draft",
    label: "Shorts/Reels script draft",
    mode: "draft_only",
    humanReviewRequired: true,
    publicPublishing: false,
    allowedFormats: ["short_script", "hook_variants"],
    maxRiskLevelWithoutReview: "low",
  },
  {
    destination: "internal_admin_alert",
    label: "Internal admin alert",
    mode: "manual_review_required",
    humanReviewRequired: true,
    publicPublishing: false,
    allowedFormats: ["risk_alert", "source_health_alert", "editorial_alert"],
    maxRiskLevelWithoutReview: "medium",
  },
] as const;

export function getContentAutomationDestinationPolicy(
  destination: ContentAutomationDestination,
): ContentAutomationDestinationPolicy {
  const policy = contentAutomationDestinationPolicies.find(
    (item) => item.destination === destination,
  );

  if (!policy) {
    throw new Error(`Unknown content automation destination: ${destination}`);
  }

  return policy;
}

export function canContentAutomationPublishWithoutHumanReview(
  destination: ContentAutomationDestination,
): boolean {
  const policy = getContentAutomationDestinationPolicy(destination);
  return policy.publicPublishing && !policy.humanReviewRequired;
}

export function assertNoContentAutomationAutoPublishPath(): void {
  const unsafe = contentAutomationDestinationPolicies.filter(
    (policy) => policy.publicPublishing && !policy.humanReviewRequired,
  );

  if (unsafe.length > 0) {
    throw new Error(
      `Unsafe content automation auto-publish destinations: ${unsafe
        .map((item) => item.destination)
        .join(", ")}`,
    );
  }
}
