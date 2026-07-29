/**
 * Coaching Engine — Deterministic coaching generation.
 *
 * Generates daily/weekly/monthly coaching cards from behavioral scores.
 * No AI API calls — pure computation from behavioral snapshot data.
 * All output is in Persian.
 */

import type { BehavioralSnapshot, BehavioralDimension } from "@/lib/behavioral-engine";
import { DIMENSION_LABELS } from "@/lib/behavioral-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CoachingCardType = "daily" | "weekly" | "monthly";
export type CoachingTone = "encourage" | "warn" | "challenge" | "celebrate";

export type CoachingCard = {
  type: CoachingCardType;
  tone: CoachingTone;
  headline: string;
  body: string;
  why: string;
  evidence: string;
  suggestedAction: string;
  expectedImprovement: string;
  focusDimension: BehavioralDimension | null;
  generatedAt: number;
};

export type CoachingWarning = {
  dimension: BehavioralDimension;
  label: string;
  message: string;
  urgency: "critical" | "important" | "advisory";
};

export type CoachingReport = {
  daily: CoachingCard;
  weekly: CoachingCard;
  monthly: CoachingCard;
  warnings: CoachingWarning[];
  encouragements: string[];
  reviewReminder: string | null;
};

// ─── Coaching content tables ──────────────────────────────────────────────────

type DimensionCoachContent = {
  lowHeadline: string;
  lowBody: string;
  lowAction: string;
  highHeadline: string;
  highBody: string;
  highAction: string;
};

const DIMENSION_COACHING: Record<BehavioralDimension, DimensionCoachContent> = {
  discipline: {
    lowHeadline: "انضباط یادگیری نیاز به تقویت دارد",
    lowBody: "streak شما نشان می‌دهد که مطالعه منظم هنوز تبدیل به عادت نشده. مطالعه روزانه کوتاه، از هر session طولانی نامنظم مؤثرتر است.",
    lowAction: "امروز حداقل ۵ دقیقه مطالعه کنید — حتی یک فلش‌کارت کافی است.",
    highHeadline: "انضباط یادگیری شما مثال‌زدنی است",
    highBody: "ادامه دادن یکی از سخت‌ترین مهارت‌هاست. streak شما نشان می‌دهد که توانسته‌اید عادت یادگیری را بسازید.",
    highAction: "این عادت را حفظ کنید. هر روز اول صبح ۵ دقیقه فلش‌کارت مرور کنید.",
  },
  patience: {
    lowHeadline: "شتاب در یادگیری می‌تواند مشکل‌ساز باشد",
    lowBody: "نوسان بالای نمرات معمولاً نشانه‌ای از عبور سریع از مطالب است. دانشی که عجولانه یاد گرفته شود، زود فراموش می‌شود.",
    lowAction: "قبل از هر آزمون، تمام فلش‌کارت‌های آن درس را مرور کنید.",
    highHeadline: "صبر در یادگیری دارید",
    highBody: "یادگیری عمیق نیاز به صبر دارد. نمرات باثبات شما نشان می‌دهد که عجله نمی‌کنید.",
    highAction: "این رویکرد را ادامه دهید. عمق مهم‌تر از سرعت است.",
  },
  risk_management: {
    lowHeadline: "به آستانه‌های تسلط توجه بیشتری داشته باشید",
    lowBody: "عبور از دروازه تسلط با نمره پایین یعنی پایه‌ها محکم نیستند. بدون پایه محکم، مطالب پیچیده‌تر درک نمی‌شوند.",
    lowAction: "درس‌هایی که نمره زیر ۸۰٪ دارند را دوباره مرور کنید.",
    highHeadline: "مدیریت ریسک یادگیری خوب است",
    highBody: "عبور از دروازه‌های تسلط با نمرات بالا نشان می‌دهد که به دانش خود اطمینان دارید.",
    highAction: "همین رویکرد را در معاملات هم به کار ببرید: قبل از هر عمل، مطمئن شوید.",
  },
  consistency: {
    lowHeadline: "ثبات یادگیری را تقویت کنید",
    lowBody: "مغز با تکرار منظم یاد می‌گیرد — نه با marathon‌های تک‌بار. حتی ۱۰ دقیقه روزانه از ۲ ساعت در هفته مؤثرتر است.",
    lowAction: "یک زمان ثابت روزانه برای مطالعه انتخاب کنید — حتی شب قبل از خواب.",
    highHeadline: "ثبات یادگیری شما عالی است",
    highBody: "مطالعه منظم روزانه، قوی‌ترین عامل در یادگیری بلندمدت است.",
    highAction: "این عادت را ادامه دهید و یک هدف هفتگی برای خودتان تعیین کنید.",
  },
  reflection: {
    lowHeadline: "بازتاب یادگیری را جدی‌تر بگیرید",
    lowBody: "بازتاب فقط نوشتن نیست — فرایندی است که دانش را از حافظه کوتاه‌مدت به بلندمدت منتقل می‌کند. بدون آن، بخش زیادی از آنچه خواندید ظرف ۲۴ ساعت فراموش می‌شود.",
    lowAction: "بعد از هر درس، ۳ چیزی که یاد گرفتید را بنویسید.",
    highHeadline: "عادت بازتاب یادگیری را ساخته‌اید",
    highBody: "بازتاب نوشتاری یکی از مؤثرترین روش‌های تثبیت حافظه است. این عادت را ادامه دهید.",
    highAction: "بازتاب‌های خود را هفته‌ای یک بار مرور کنید تا پیشرفت را ببینید.",
  },
  confidence: {
    lowHeadline: "اطمینان با تکرار می‌آید",
    lowBody: "اطمینان پایین در یادگیری معمولاً از مرور ناکافی است. مطالب را بیشتر مرور کنید و فلش‌کارت‌ها را استفاده کنید.",
    lowAction: "فلش‌کارت‌هایی که نمره پایین دارند را هر روز مرور کنید.",
    highHeadline: "اطمینان به دانش خوب است",
    highBody: "اطمینان که از تکرار و مرور واقعی می‌آید، ارزشمند است.",
    highAction: "این دانش را با مثال‌های واقعی آزمایش کنید.",
  },
  fomo_risk: {
    lowHeadline: "خطر FOMO در یادگیری",
    lowBody: "عبور سریع از درس‌ها بدون بازتاب، نشانه‌ای از هیجان‌زدگی است. این الگو در معاملات هم ظاهر می‌شود.",
    lowAction: "قبل از رفتن به درس بعدی بپرسید: می‌توانم این مفهوم را با مثال توضیح دهم؟",
    highHeadline: "کنترل FOMO خوب است",
    highBody: "سرعت آرام و منظم در یادگیری، بهترین روش برای ایجاد عادت‌های معاملاتی سالم است.",
    highAction: "همین رویکرد آرام را در تصمیمات مالی هم به کار ببرید.",
  },
  revenge_risk: {
    lowHeadline: "احتیاط: ریسک معامله انتقامی",
    lowBody: "تلاش مجدد عجولانه بعد از شکست، الگویی است که در بازار هزینه می‌برد. قبل از هر تلاش مجدد، مطالب را مرور کنید.",
    lowAction: "بعد از هر شکست در آزمون، حداقل ۱۵ دقیقه صبر کنید و مطالب را بخوانید.",
    highHeadline: "رویکرد متعادل پس از شکست دارید",
    highBody: "پذیرش شکست و مرور آرام قبل از تلاش مجدد، نشانه‌ای از بلوغ در یادگیری است.",
    highAction: "این رویکرد را در معاملات هم داشته باشید.",
  },
  preparation: {
    lowHeadline: "آمادگی قبل از آزمون مهم است",
    lowBody: "فلش‌کارت‌ها قبل از آزمون نشانه آمادگی هستند. بدون آن، حافظه کوتاه‌مدت در آزمون جواب می‌دهد اما فراموش می‌شود.",
    lowAction: "قبل از هر آزمون، تمام فلش‌کارت‌های آن درس را حداقل یک بار مرور کنید.",
    highHeadline: "آمادگی قبل از آزمون خوب است",
    highBody: "مرور فلش‌کارت قبل از آزمون، یکی از بهترین روش‌های تثبیت دانش است.",
    highAction: "این عادت را ادامه دهید و سعی کنید روز قبل از آزمون هم مرور کنید.",
  },
  knowledge_depth: {
    lowHeadline: "عمق دانش را افزایش دهید",
    lowBody: "نمرات پایین در آزمون‌ها یا Ease Factor پایین در فلش‌کارت‌ها نشان می‌دهد که مفاهیم هنوز عمیق درونی نشده‌اند.",
    lowAction: "برای هر مفهوم، یک مثال از زندگی واقعی بسازید و بنویسید.",
    highHeadline: "عمق دانش در حال رشد است",
    highBody: "نمرات بالا و Ease Factor بالا در فلش‌کارت‌ها نشان‌دهنده یادگیری عمیق است.",
    highAction: "این دانش را در مثال‌های پیچیده‌تر آزمایش کنید.",
  },
  decision_quality: {
    lowHeadline: "کیفیت تصمیم‌گیری را تقویت کنید",
    lowBody: "انتخاب نادرست در آزمون‌ها معمولاً از درک ناقص گزینه‌هاست. قبل از انتخاب، هر گزینه را کامل بخوانید.",
    lowAction: "در هر آزمون، ابتدا گزینه‌های غلط را حذف کنید و بعد بین باقی‌مانده‌ها تصمیم بگیرید.",
    highHeadline: "کیفیت تصمیم‌گیری بالاست",
    highBody: "انتخاب‌های درست در آزمون نشان‌دهنده درک عمیق مفاهیم است.",
    highAction: "این مهارت را در تحلیل پروژه‌های واقعی هم تمرین کنید.",
  },
  execution_quality: {
    lowHeadline: "تکمیل کامل درس‌ها را جدی بگیرید",
    lowBody: "عبور از فلش‌کارت یا بازتاب یادگیری، بخشی از یادگیری را از بین می‌برد.",
    lowAction: "هر درس را کامل تمام کنید: خواندن → سؤال → فلش‌کارت → آزمون → بازتاب.",
    highHeadline: "کیفیت اجرای یادگیری عالی است",
    highBody: "تکمیل کامل هر درس نشان‌دهنده تعهد جدی به یادگیری است.",
    highAction: "این رویکرد را در تمام درس‌های آینده هم حفظ کنید.",
  },
};

// ─── Coaching generators ──────────────────────────────────────────────────────

function selectFocusDimension(snapshot: BehavioralSnapshot): BehavioralDimension | null {
  // Focus on weakest dimension that has meaningful data
  const sorted = [...snapshot.dimensions].sort((a, b) => a.score - b.score);
  return sorted[0]?.score < 70 ? sorted[0].dimension : null;
}

function selectStrongestDimension(snapshot: BehavioralSnapshot): BehavioralDimension | null {
  const sorted = [...snapshot.dimensions].sort((a, b) => b.score - a.score);
  return sorted[0]?.score > 70 ? sorted[0].dimension : null;
}

export function generateDailyCoaching(snapshot: BehavioralSnapshot): CoachingCard {
  const focusDim = selectFocusDimension(snapshot);
  const content = focusDim ? DIMENSION_COACHING[focusDim] : null;
  const isLow = focusDim ? (snapshot.dimensions.find((d) => d.dimension === focusDim)?.score ?? 0) < 50 : false;

  const hasStreak = snapshot.dimensions.find((d) => d.dimension === "discipline")?.score ?? 0 > 60;
  const overallGood = snapshot.overallScore >= 65;

  let tone: CoachingTone = "challenge";
  if (snapshot.overallScore >= 80) tone = "celebrate";
  else if (snapshot.overallScore < 40) tone = "warn";
  else if (hasStreak) tone = "encourage";

  const headline = content && isLow
    ? content.lowHeadline
    : content && !isLow
    ? content.highHeadline
    : overallGood
    ? "روز خوبی برای یادگیری"
    : "امروز یک قدم بردار";

  const body = content && isLow
    ? content.lowBody
    : content && !isLow
    ? content.highBody
    : "هر روز یادگیری، حتی کوچک، شما را به هدف نزدیک‌تر می‌کند.";

  return {
    type: "daily",
    tone,
    headline,
    body,
    why: `امتیاز کلی رفتار یادگیری شما ${snapshot.overallScore} از ۱۰۰ است.`,
    evidence: focusDim
      ? `ضعیف‌ترین بُعد: ${DIMENSION_LABELS[focusDim]}`
      : `قوی‌ترین بُعد: ${snapshot.strongestDimension ? DIMENSION_LABELS[snapshot.strongestDimension] : "در حال ساخت"}`,
    suggestedAction: content && isLow ? content.lowAction : content?.highAction ?? "امروز یک درس یا فلش‌کارت مرور کنید.",
    expectedImprovement: focusDim
      ? `با ۳ روز متوالی، ${DIMENSION_LABELS[focusDim]} بهبود خواهد یافت.`
      : "ادامه دادن، شما را به سطح بعدی می‌رساند.",
    focusDimension: focusDim,
    generatedAt: Date.now(),
  };
}

export function generateWeeklyCoaching(snapshot: BehavioralSnapshot): CoachingCard {
  const strongDim = selectStrongestDimension(snapshot);
  const weakDim = selectFocusDimension(snapshot);
  const weeklyScore = snapshot.overallScore;

  const tone: CoachingTone = weeklyScore >= 75 ? "celebrate" : weeklyScore >= 50 ? "challenge" : "warn";

  return {
    type: "weekly",
    tone,
    headline: weeklyScore >= 75 ? "هفته یادگیری قوی داشتید" : weeklyScore >= 50 ? "هفته متوسط — پتانسیل بیشتری دارید" : "این هفته فرصتی برای شروع جدید است",
    body: [
      strongDim ? `قوی‌ترین بُعد این هفته: ${DIMENSION_LABELS[strongDim]}.` : "",
      weakDim ? `بُعدی که بیشترین توجه را می‌خواهد: ${DIMENSION_LABELS[weakDim]}.` : "",
      "یادگیری یک فرایند است، نه یک رویداد.",
    ].filter(Boolean).join(" "),
    why: "مرور هفتگی به شما کمک می‌کند الگوهای رفتاری خود را ببینید و اصلاح کنید.",
    evidence: `امتیاز کلی هفتگی: ${weeklyScore}/۱۰۰ — ${snapshot.dataQuality === "sparse" ? "داده کم" : snapshot.dataQuality === "moderate" ? "داده متوسط" : "داده کافی"}`,
    suggestedAction: weakDim ? DIMENSION_COACHING[weakDim].lowAction : "این هفته یک درس جدید را کامل کنید.",
    expectedImprovement: "یک هفته منظم می‌تواند امتیاز رفتاری شما را ۱۰ تا ۲۰ امتیاز بهبود دهد.",
    focusDimension: weakDim,
    generatedAt: Date.now(),
  };
}

export function generateMonthlyCoaching(snapshot: BehavioralSnapshot): CoachingCard {
  const style = snapshot.preferredLearningStyle;
  const velocity = snapshot.learningVelocity;

  return {
    type: "monthly",
    tone: snapshot.overallScore >= 70 ? "celebrate" : "challenge",
    headline: snapshot.overallScore >= 70 ? "ماه یادگیری موفق" : "ماه آینده: زمان تمرکز",
    body: [
      `سبک یادگیری شما: ${style === "analytical" ? "تحلیلی (مرور منظم، دقت بالا)" : style === "practical" ? "عملی (تجربه محور)" : "ترکیبی"}.`,
      `سرعت یادگیری: ${velocity > 1 ? `${velocity} درس در هفته` : "کمتر از ۱ درس در هفته"}.`,
      velocity < 1 ? "هدف ماه آینده: حداقل ۱ درس در هفته." : "این سرعت را حفظ کنید.",
    ].join(" "),
    why: "مرور ماهانه به شما کمک می‌کند بفهمید آیا در مسیر درست هستید.",
    evidence: `سبک یادگیری: ${style} — سرعت: ${velocity} درس/هفته`,
    suggestedAction: velocity < 0.5
      ? "یک برنامه هفتگی مشخص بگذارید: چه روزهایی، چه ساعتی."
      : "هدف ترم بعدی را مشخص کنید.",
    expectedImprovement: "با یک برنامه ماهانه مشخص، احتمال فارغ‌التحصیلی به شکل قابل توجهی بالا می‌رود.",
    focusDimension: snapshot.weakestDimension,
    generatedAt: Date.now(),
  };
}

export function generateWarnings(snapshot: BehavioralSnapshot): CoachingWarning[] {
  const warnings: CoachingWarning[] = [];

  for (const dim of snapshot.dimensions) {
    if (dim.score < 30) {
      warnings.push({
        dimension: dim.dimension,
        label: DIMENSION_LABELS[dim.dimension],
        message: DIMENSION_COACHING[dim.dimension].lowBody,
        urgency: "critical",
      });
    } else if (dim.score < 50) {
      warnings.push({
        dimension: dim.dimension,
        label: DIMENSION_LABELS[dim.dimension],
        message: DIMENSION_COACHING[dim.dimension].lowBody,
        urgency: "important",
      });
    }
  }

  return warnings.slice(0, 3);
}

export function generateEncouragements(snapshot: BehavioralSnapshot): string[] {
  const msgs: string[] = [];

  if (snapshot.dimensions.find((d) => d.dimension === "discipline")?.score ?? 0 > 70) {
    msgs.push("streak شما نشان‌دهنده عادت یادگیری واقعی است — این ارزشمندترین چیزی است که می‌توانید بسازید.");
  }
  if (snapshot.overallScore >= 80) {
    msgs.push("سطح رفتار یادگیری شما در ۲۰٪ بالای کاربران است.");
  }
  if (snapshot.dimensions.find((d) => d.dimension === "reflection")?.score ?? 0 > 60) {
    msgs.push("بازتاب یادگیری ثبت می‌کنید — این تفاوت بین معامله‌گر متوسط و حرفه‌ای است.");
  }
  if (snapshot.dimensions.find((d) => d.dimension === "knowledge_depth")?.score ?? 0 > 75) {
    msgs.push("عمق دانش شما عالی است — نه فقط پاسخ بلکه دلیل را می‌فهمید.");
  }

  return msgs.slice(0, 2);
}

export function generateReviewReminder(snapshot: BehavioralSnapshot, dueFlashcards: number): string | null {
  if (dueFlashcards > 0) {
    return `${dueFlashcards} فلش‌کارت برای مرور امروز دارید — فقط ${Math.ceil(dueFlashcards * 0.5)} دقیقه وقت می‌برد.`;
  }
  const prepScore = snapshot.dimensions.find((d) => d.dimension === "preparation")?.score ?? 0;
  if (prepScore < 40) {
    return "فلش‌کارت‌های درس‌های تکمیل‌شده را مرور کنید تا به حافظه بلندمدت تبدیل شوند.";
  }
  return null;
}

// ─── Full report ──────────────────────────────────────────────────────────────

export function generateCoachingReport(snapshot: BehavioralSnapshot, dueFlashcards = 0): CoachingReport {
  return {
    daily: generateDailyCoaching(snapshot),
    weekly: generateWeeklyCoaching(snapshot),
    monthly: generateMonthlyCoaching(snapshot),
    warnings: generateWarnings(snapshot),
    encouragements: generateEncouragements(snapshot),
    reviewReminder: generateReviewReminder(snapshot, dueFlashcards),
  };
}
