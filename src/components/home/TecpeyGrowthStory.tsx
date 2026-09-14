"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, use, type ReactNode } from "react";
import {
  ArrowUpRight, BarChart3, BookOpen, BrainCircuit, Check, FileCheck2, Gift,
  ChevronDown, Globe2, GraduationCap, Infinity as InfinityIcon, LineChart, LockKeyhole,
  Mountain, Newspaper, NotebookPen, Repeat2, ShieldCheck, Sparkles, Target,
  Trophy, UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TecpeyMark } from "@/components/brand/TecpeyMark";
import { PremiumIcon } from "@/components/tecpey/NeonIcon";
import { HomeDiscoveryStrip } from "./HomeDiscoveryStrip";
import { LandingGrowthRadar } from "./LandingGrowthRadar";
import { StoryLeague, StoryMarketBoard, StoryNews } from "./StoryLiveData";
import type { LandingGrowthRadarModel } from "@/lib/landing-growth";
import styles from "./growth-story.module.css";

type Locale = "fa" | "en";

function Discovery({ promise, locale }: { promise: Promise<LandingGrowthRadarModel>; locale: Locale }) {
  const radar = use(promise);
  return <><HomeDiscoveryStrip locale={locale} radar={radar} /><LandingGrowthRadar locale={locale} radar={radar} /></>;
}

function SectionHeader({ icon: Icon, kicker, title, description, id }: {
  icon: LucideIcon; kicker: string; title: string; description: string; id: string;
}) {
  return <header className={styles.sectionHeader}>
    <span className={styles.sectionSignal}><PremiumIcon icon={Icon} size="sm" /><span className={styles.kicker}>{kicker}</span></span>
    <h2 id={id}>{title}</h2>
    <p>{description}</p>
  </header>;
}

function Chapter({ id, tone = "light", children, labelledBy, stage, locale }: {
  id: string; tone?: "light" | "dark" | "clear"; children: ReactNode; labelledBy: string;
  stage: number; locale: Locale;
}) {
  return <section id={id} data-home-section={id} data-journey-stage={stage} className={`${styles.chapter} ${styles[tone]}`} aria-labelledby={labelledBy}>
    <div className={styles.chapterInner}>
      <div className={styles.stageMarker} aria-label={locale === "fa" ? `ایستگاه ${stage} از ۸ مسیر رشد` : `Growth journey stage ${stage} of 8`}>
        <span aria-hidden="true"><bdi>{new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { minimumIntegerDigits: 2 }).format(stage)}</bdi><small>/{locale === "fa" ? "۰۸" : "08"}</small></span>
        <strong>{locale === "fa" ? "مسیر رشد" : "Growth path"}</strong>
      </div>
      {children}
    </div>
  </section>;
}

/** One composition keeps Persian and English product claims, routes and data states in parity. */
export function TecpeyGrowthStory({ locale, growthRadarPromise, schema }: {
  locale: Locale; growthRadarPromise: Promise<LandingGrowthRadarModel>; schema?: ReactNode;
}) {
  const fa = locale === "fa";
  const prefix = fa ? "" : "/en";
  const t = (persian: string, english: string) => fa ? persian : english;
  const link = (path: string) => `${prefix}${path}`;
  const curriculum = fa
    ? ["مبانی بازار", "امنیت و کیف پول", "تحلیل تکنیکال", "تحلیل بنیادی", "استراتژی معامله", "مدیریت ریسک", "روان‌شناسی و آمادگی"]
    : ["Market foundations", "Security and wallets", "Technical analysis", "Fundamental analysis", "Trading strategy", "Risk management", "Psychology and readiness"];
  const mastery = fa
    ? [[Target, "برنامه شخصی رشد", "ضعف بعدی از شواهد پیشرفتت انتخاب می‌شود."], [Repeat2, "تمرین و بازپخش", "تصمیم را تکرار، مقایسه و دقیق‌تر می‌کنی."], [BrainCircuit, "مرور با منتور", "الگوی تصمیم‌ها و خطاها را با زمینه می‌بینی."], [FileCheck2, "نمونه‌کار معتبر", "شواهد یادگیری به کارنامه مهارتی اضافه می‌شود."]] as const
    : [[Target, "A personal growth plan", "Your next weak spot is selected from progress evidence."], [Repeat2, "Practice and replay", "Repeat, compare and sharpen each decision."], [BrainCircuit, "Mentor review", "See decision patterns and errors in context."], [FileCheck2, "Verified work samples", "Learning evidence becomes part of your skills record."]] as const;
  const academyEvidence = fa
    ? [[FileCheck2, "ارزیابی پایان هر ترم", "عبور مرحله‌ای با نتیجه قابل ثبت"], [Repeat2, "مرور هوشمند", "بازگشت هدفمند به نقاط فراموش‌شده"], [Target, "چالش و تمرین روزانه", "تبدیل مطالعه به عادت قابل سنجش"], [ShieldCheck, "گواهی قابل استعلام", "مدرک دارای مسیر بررسی و اعتبار"]] as const
    : [[FileCheck2, "End-of-term assessments", "Progress through recorded evidence"], [Repeat2, "Smart review", "Return to concepts most at risk of fading"], [Target, "Daily practice challenges", "Turn study into measurable consistency"], [ShieldCheck, "Verifiable certificate", "A credential with a validation path"]] as const;

  return <main className={styles.story} data-runtime-contract="landing-growth-v1" lang={fa ? "fa" : "en"} dir={fa ? "rtl" : "ltr"}>
    {schema}
    <section data-home-section="hero" className={styles.hero} aria-labelledby="growth-hero-title">
      <Image className={styles.heroImage} src="/images/landing/growth-mountain.webp" alt="" fill priority sizes="100vw" />
      <div className={styles.heroShade} aria-hidden="true" />
      <div className={styles.heroRoute} aria-hidden="true">
        <span className={`${styles.routeNode} ${styles.routeStart}`}><BookOpen size={15} /><b>{t("شروع", "Start")}</b></span>
        <span className={`${styles.routeNode} ${styles.routePractice}`}><LineChart size={15} /><b>{t("تمرین", "Practice")}</b></span>
        <span className={`${styles.routeNode} ${styles.routeSkill}`}><BrainCircuit size={15} /><b>{t("مهارت", "Skill")}</b></span>
        <span className={`${styles.routeNode} ${styles.routeFuture}`}><Mountain size={15} /><b>{t("آینده روشن", "A brighter future")}</b></span>
      </div>
      <div className={styles.heroInner}><div className={styles.heroCopy}>
        <span className={styles.heroBrand}><TecpeyMark alt="" width={34} height={34} /><span>TecPey</span></span>
        <h1 id="growth-hero-title">{t("از اولین قدم،", "From your first step,")}<br /><em>{t("تا کارنامه مهارتی تو", "to your skills portfolio")}</em></h1>
        <p>{t("خبر را بفهم، بازار را با داده بخوان، یاد بگیر و با سرمایه مجازی تمرین کن. منتور تک‌پی کمک می‌کند هر تصمیم به یک مهارت قابل اثبات تبدیل شود.", "Understand the news, read the market through data, learn and practice with virtual capital. TecPey Mentor helps turn every decision into demonstrable skill.")}</p>
        <div className={styles.actions} data-mobile-learning-cta>
          <Link className={styles.primary} href={link("/academy")}>{t("شروع رایگان آکادمی", "Start Academy free")}<BookOpen size={19} aria-hidden="true" /></Link>
          <a className={styles.heroSecondary} href="#story-news">{t("کشف مسیر رشد", "Explore the journey")}<ArrowUpRight size={18} aria-hidden="true" /></a>
        </div>
      </div></div>
      <div className={styles.heroSignals}>
        <span><Newspaper size={17} />{t("خبر معتبر", "Trusted news")}</span><span><BarChart3 size={17} />{t("داده زنده بازار", "Live market data")}</span><span><BrainCircuit size={17} />{t("منتور آموزشی", "Learning mentor")}</span><span><ShieldCheck size={17} />{t("تمرین بدون پول واقعی", "No-real-money practice")}</span>
      </div>
    </section>

    <nav className={styles.chapterNav} aria-label={t("فصل‌های مسیر تک‌پی", "TecPey journey chapters")}>
      {[["story-news", t("خبر", "News")], ["story-market", t("بازار", "Market")], ["story-academy", t("آکادمی", "Academy")], ["story-practice", t("آرنا", "Arena")], ["story-league", t("لیگ", "League")], ["story-mastery", t("ترم ۸", "Term 8")]].map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
    </nav>

    <Chapter id="story-news" stage={1} locale={locale} labelledBy="story-news-title">
      <SectionHeader icon={Newspaper} kicker={t("زمینه قبل از تصمیم", "Context before decisions")} id="story-news-title" title={t("خبر را بخوان؛ اثرش را بشناس", "Read the news. Understand its impact.")} description={t("خبرهای لحظه‌ای منابع معتبر، ترجمه فارسی و خلاصه آموزشی تک‌پی کنار منبع و زمان انتشار قرار می‌گیرند تا تیتر را با زمینه بازار بخوانی.", "Timely reporting from trusted sources, translated context and TecPey learning summaries stay beside source and publication time so every headline has market context.")} />
      <div className={styles.valueRail}><span><Globe2 size={18} />{t("منبع شفاف", "Clear source")}</span><span><Newspaper size={18} />{t("ترجمه و خلاصه", "Translation and summary")}</span><span><LineChart size={18} />{t("اثر بر بازار", "Market impact")}</span></div>
      <StoryNews locale={locale} />
    </Chapter>

    <Chapter id="story-market" stage={2} locale={locale} tone="dark" labelledBy="story-market-title">
      <SectionHeader icon={BarChart3} kicker={t("نبض بازار با منبع", "The sourced market pulse")} id="story-market-title" title={t("بازار را با داده قابل بررسی ببین", "See the market through verifiable data")} description={t("قیمت، تغییر ۲۴ ساعته، هیت‌مپ و شاخص‌های محاسبه‌شده روی داده‌های نمایش‌داده‌شده؛ همراه با منبع، مبنای قیمت و زمان دریافت.", "Prices, 24-hour change, heatmap and indicators calculated from the displayed dataset, together with source, quote currency and retrieval time.")} />
      <StoryMarketBoard locale={locale} />
      <details className={styles.discovery}><summary><span>{t("کوین‌ها، ابزارها و خبرهای مرتبط را باز کن", "Open related coins, tools and news")}</span><ChevronDown size={18} aria-hidden="true" /></summary><Suspense fallback={<p role="status">{t("در حال دریافت داده مرتبط…", "Loading related data…")}</p>}><Discovery promise={growthRadarPromise} locale={locale} /></Suspense></details>
    </Chapter>

    <Chapter id="story-academy" stage={3} locale={locale} labelledBy="story-academy-title">
      <div className={styles.academyIntro}>
        <SectionHeader icon={GraduationCap} kicker={t("یادگیری مرحله‌ای", "Structured learning")} id="story-academy-title" title={t("با منتور تمرین کن؛ فقط درس نخوان", "Practice with a mentor, not just a syllabus")} description={t("هفت ترم از مبانی و امنیت تا تحلیل، ریسک و روان‌شناسی. هر مرحله با تمرین، ارزیابی و بازخورد به مرحله بعد وصل می‌شود.", "Seven terms from foundations and security to analysis, risk and psychology. Practice, assessment and feedback connect every stage to the next.")} />
        <aside className={styles.mentorCard}><PremiumIcon icon={BrainCircuit} size="md" /><div><strong>{t("منتور در تمام مسیر", "A mentor throughout")}</strong><p>{t("برای فهم درس، مرور اشتباه و انتخاب تمرین بعدی؛ نه فروش سیگنال.", "For lesson clarity, mistake review and the next practice choice, never signal selling.")}</p></div><Link href={link("/academy/ai-guide")} aria-label={t("آشنایی با منتور تک‌پی", "Meet TecPey Mentor")}><ArrowUpRight size={20} /></Link></aside>
      </div>
      <ol className={styles.learningPath}>{curriculum.map((name, index) => <li key={name}><Link href={link(`/academy/term-${index + 1}`)}><span>{new Intl.NumberFormat(fa ? "fa-IR" : "en-US").format(index + 1)}</span><strong>{name}</strong></Link></li>)}</ol>
      <div className={styles.academyEvidence} aria-label={t("امکانات سنجش و اعتبار آکادمی", "Academy assessment and credential features")}>{academyEvidence.map(([Icon, title, description]) => <article key={title}><PremiumIcon icon={Icon} size="xs" /><div><strong>{title}</strong><small>{description}</small></div></article>)}</div>
      <div className={styles.centerAction}><Link className={styles.primary} href={link("/academy")}>{t("دیدن مسیر کامل آکادمی", "Explore the full Academy")}<ArrowUpRight size={18} /></Link></div>
    </Chapter>

    <Chapter id="story-practice" stage={4} locale={locale} tone="dark" labelledBy="story-practice-title">
      <SectionHeader icon={LineChart} kicker={t("تمرین با سرمایه مجازی", "Practice with virtual capital")} id="story-practice-title" title={t("دانش را به تصمیم قابل بازبینی تبدیل کن", "Turn knowledge into reviewable decisions")} description={t("در تریدینگ آرنا بدون پول واقعی معامله را تمرین کن؛ بعد دلیل، احساس و نتیجه هر تصمیم را در ژورنال نگه دار و با منتور مرور کن.", "Practice trades in the Trading Arena without real money, then keep the reason, emotion and outcome of each decision in your journal and review it with a mentor.")} />
      <div className={styles.practiceScene}>
        <div className={styles.tradingPreview}><div className={styles.previewTop}><span>{t("یک تصمیم، سه لایه بازبینی", "One decision, three review layers")}</span><bdi>{t("نمونه محیط آموزشی", "Learning preview")}</bdi></div><div className={styles.decisionTimeline}><div><span><Target size={18} /></span><p><strong>{t("پیش از معامله", "Before the trade")}</strong><small>{t("سناریو، حد ریسک و دلیل ورود", "Scenario, risk limit and entry rationale")}</small></p></div><div><span><LineChart size={18} /></span><p><strong>{t("حین تمرین", "During practice")}</strong><small>{t("اجرای تصمیم با سرمایه کاملاً مجازی", "Execution with fully virtual capital")}</small></p></div><div><span><NotebookPen size={18} /></span><p><strong>{t("پس از بستن", "After close")}</strong><small>{t("نتیجه، احساس و نکته آموخته‌شده", "Outcome, emotion and lesson learned")}</small></p></div></div><div className={styles.previewStats}><span>{t("محیط تمرین", "Practice environment")}<bdi>{t("بدون پول واقعی", "No real money")}</bdi></span><span>{t("خروجی", "Output")}<bdi>{t("شاهد مهارتی", "Skill evidence")}</bdi></span></div></div>
        <div className={styles.practiceSteps}><div><LineChart size={22} /><span><strong>{t("تریدینگ آرنا", "Trading Arena")}</strong><small>{t("اجرای سناریو با سرمایه مجازی", "Execute a virtual-capital scenario")}</small></span></div><div><NotebookPen size={22} /><span><strong>{t("ژورنال تصمیم", "Decision journal")}</strong><small>{t("ثبت دلیل، احساس و نتیجه", "Record reason, emotion and outcome")}</small></span></div><div><BrainCircuit size={22} /><span><strong>{t("تحلیل با منتور", "Mentor analysis")}</strong><small>{t("کشف الگو، نه وعده سود", "Find patterns, never profit promises")}</small></span></div><Link className={styles.primary} href={link("/academy/trading-arena")}>{t("شروع تمرین", "Start practicing")}<ArrowUpRight size={18} /></Link></div>
      </div>
    </Chapter>

    <Chapter id="story-league" stage={5} locale={locale} labelledBy="story-league-title">
      <SectionHeader icon={Trophy} kicker={t("رقابت برای پیشرفت", "Compete to improve")} id="story-league-title" title={t("لیگ تک‌پی؛ رتبه‌ای که از یادگیری می‌آید", "TecPey League: a rank earned through learning")} description={t("امتیاز از شواهد معتبر آرنا و پیشرفت آموزشی ساخته می‌شود. رتبه ماهانه و کلی، قوانین شفاف و نمایش اختیاری پروفایل، رقابت را سالم نگه می‌دارند.", "Scores come from eligible Arena evidence and learning progress. Monthly and all-time ranks, clear rules and optional profile visibility keep competition healthy.")} />
      <div className={styles.leagueLayout}><StoryLeague locale={locale} /><aside className={styles.rewardPanel}><div className={styles.rewardIcon}><Gift size={28} /></div><span className={styles.status}>{t("جوایز هر دوره پیش از شروع اعلام می‌شود", "Rewards are announced before each season")}</span><h3>{t("پاداش نقدی و غیرنقدی", "Cash and non-cash rewards")}</h3><ul><li><Trophy size={18} />{t("جوایز نقدی با بودجه و شرایط روشن", "Cash prizes with a published budget and terms")}</li><li><GraduationCap size={18} />{t("اشتراک، دوره و فرصت منتورینگ", "Subscriptions, courses and mentoring opportunities")}</li><li><UsersRound size={18} />{t("نشان مهارتی و معرفی برترین‌ها", "Skill badges and learner spotlights")}</li></ul><p>{t("پاداش‌ها هنوز فعال نشده‌اند و تا اعلام رسمی، موجودی یا حق مالی ایجاد نمی‌کنند.", "Rewards are not active yet and create no balance or financial entitlement before an official season announcement.")}</p></aside></div>
    </Chapter>

    <section data-home-section="pro-gift" data-journey-stage="6" className={styles.gift} aria-labelledby="gift-title"><div className={styles.giftGlow} aria-hidden="true" /><div className={styles.giftStage} aria-label={t("ایستگاه ۶ از ۸؛ پاداش مسیر", "Stage 6 of 8: journey reward")}><span aria-hidden="true"><bdi>{t("۰۶", "06")}</bdi><small>{t("/۰۸", "/08")}</small></span><strong>{t("پاداش مسیر", "Journey reward")}</strong></div><TecpeyMark alt="" width={58} height={58} /><div><span>{t("هدیه فارغ‌التحصیلی", "Graduation gift")}</span><h2 id="gift-title">{t("پایان ترم ۷، یک ماه Pro برای همه تکمیل‌کنندگان واجد شرایط", "Complete Term 7 and receive one month of Pro as an eligible graduate")}</h2><p>{t("این هدیه مستقل از رتبه لیگ است. زمان فعال‌سازی و شرایط نهایی در حساب آکادمی اعلام می‌شود.", "This gift is independent of league rank. Activation timing and final eligibility will be published in the Academy account.")}</p></div><Gift size={38} aria-hidden="true" /></section>

    <Chapter id="story-mastery" stage={7} locale={locale} tone="clear" labelledBy="story-mastery-title">
      <Image className={styles.masteryImage} src="/images/landing/growth-mountain.webp" alt="" fill sizes="100vw" /><div className={styles.masteryShade} aria-hidden="true" />
      <div className={styles.masteryContent}><SectionHeader icon={InfinityIcon} kicker={t("پایان دوره، آغاز رشد", "The course ends. Growth continues.")} id="story-mastery-title" title={t("ترم ۸؛ مسیر بی‌نهایت تو", "Term 8: your lifelong growth loop")} description={t("بعد از هفت ترم، تک‌پی از شواهد واقعی یادگیری و تمرین تو برای ساختن فصل‌های شخصی رشد استفاده می‌کند؛ ضعف را پیدا کن، تمرین کن، بازبینی کن و قوی‌تر برگرد.", "After seven terms, TecPey uses your learning and practice evidence to shape personal growth seasons: find a gap, practice, review and return stronger.")} /><div className={styles.masteryGrid}>{mastery.map(([Icon, title, description]) => <article key={title}><Icon size={23} /><h3>{title}</h3><p>{description}</p></article>)}</div><div className={styles.actions}><Link href={link("/academy/term-8")} className={styles.primary}>{t("کشف ترم ۸", "Explore Term 8")}<ArrowUpRight size={18} /></Link><Link href={link("/academy/profile")} className={styles.darkSecondary}>{t("دیدن مسیر شخصی من", "View my personal path")}</Link></div></div>
    </Chapter>

    <section data-home-section="exchange-preview" className={styles.exchangePreview} aria-labelledby="exchange-preview-title"><div><span><LockKeyhole size={17} />{t("محصول آینده؛ خارج از مسیر آموزشی", "Future product, outside the learning path")}</span><h2 id="exchange-preview-title">{t("در حال ساخت و توسعه صرافی اختصاصی و پیشرفته تک‌پی هستیم", "We are building TecPey’s dedicated advanced exchange")}</h2><p>{t("هدف محصول آینده، اتصال امن معامله واقعی به ژورنال و تحلیل آموزشی منتور است. این قابلیت اکنون در دسترس نیست و هیچ مسیر ورود یا اجرای معامله‌ای از این صفحه ندارد.", "The future product aims to connect real trades safely to the journal and mentor-led educational analysis. It is not currently available, and this page provides no sign-in or trade execution path.")}</p></div><span className={styles.developmentBadge}>{t("در حال توسعه", "In development")}</span></section>

    <section data-home-section="resume" data-journey-stage="8" className={styles.close} aria-labelledby="resume-title"><div className={styles.finalStage} aria-label={t("ایستگاه ۸ از ۸؛ مقصد مسیر", "Stage 8 of 8: destination")}><span aria-hidden="true"><bdi>{t("۰۸", "08")}</bdi><small>{t("/۰۸", "/08")}</small></span><strong>{t("مقصد مسیر", "Destination")}</strong></div><div className={styles.resumeMark}><FileCheck2 size={32} /></div><span className={styles.kicker}><Sparkles size={17} />{t("کارنامه قابل ارائه", "A presentable skills record")}</span><h2 id="resume-title">{t("کارنامه مهارتی تو؛ ساخته‌شده از شواهد، نه ادعا", "Your skills portfolio, built from evidence, not claims")}</h2><p>{t("درس‌ها، ارزیابی‌ها، تصمیم‌های آرنا، ژورنال و فصل‌های رشد کنار هم قرار می‌گیرند تا پیشرفتت را قابل مشاهده و قابل ارائه کنند.", "Lessons, assessments, Arena decisions, journal reflections and growth seasons come together to make your progress visible and presentable.")}</p><ul><li><Check size={17} />{t("پیشرفت آموزشی", "Learning progress")}</li><li><Check size={17} />{t("نمونه‌کار تمرینی", "Practice evidence")}</li><li><Check size={17} />{t("نشان‌های مهارتی", "Skill credentials")}</li><li><Check size={17} />{t("گواهی قابل استعلام", "Verifiable certificates")}</li></ul><div className={styles.actions}><Link href={link("/academy")} className={styles.primary}>{t("اولین قدم را بردار", "Take the first step")}<ArrowUpRight size={18} /></Link><Link href={link("/academy/profile")} className={styles.secondary}>{t("مشاهده کارنامه من", "View my skills record")}</Link></div></section>
  </main>;
}
