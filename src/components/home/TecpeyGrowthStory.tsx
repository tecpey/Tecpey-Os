"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, use, type ReactNode } from "react";
import { ArrowUpRight, BookOpen, BrainCircuit, CheckCheck, FileCheck2, Gift, Globe2, GraduationCap, Layers3, LineChart, Mountain, Newspaper, NotebookPen, Repeat2, ShieldCheck, Target, Trophy } from "lucide-react";
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
function Chapter({ id, step, label, title, description, children, mountain = false }: { id: string; step: string; label: string; title: string; description: string; children: ReactNode; mountain?: boolean }) {
  return <section id={id} data-home-section={id} className={`${styles.chapter} ${mountain ? styles.growth : ""}`} aria-labelledby={`${id}-title`}>
    {mountain && <Image src="/images/landing/growth-mountain.webp" alt="" fill sizes="100vw" className={styles.growthMountain} />}
    <div className={styles.chapterInner}><header className={styles.chapterHeader}><span className={styles.eyebrow}><span className={styles.step} aria-hidden="true">{step}</span>{label}</span><h2 id={`${id}-title`}>{title}</h2><p>{description}</p></header>{children}</div>
  </section>;
}

/** A single localized composition keeps news, market and learning surfaces in parity. */
export function TecpeyGrowthStory({ locale, growthRadarPromise, schema }: { locale: Locale; growthRadarPromise: Promise<LandingGrowthRadarModel>; schema?: ReactNode }) {
  const fa = locale === "fa";
  const prefix = fa ? "" : "/en";
  const t = (persian: string, english: string) => fa ? persian : english;
  const link = (path: string) => `${prefix}${path}`;
  const curriculum = fa ? ["مبانی رمزارز", "امنیت حساب و کیف پول", "صرافی و معاملات اسپات", "تحلیل پروژه و توکنومیکس", "تحلیل تکنیکال", "مدیریت سرمایه و ریسک", "روان‌شناسی و آمادگی بازار"] : ["Crypto foundations", "Account & wallet security", "Exchange & spot trading", "Research & tokenomics", "Technical analysis", "Capital & risk management", "Psychology & readiness"];
  const feature = (Icon: typeof BookOpen, title: string, description: string, href: string) => <Link className={styles.feature} href={href}><Icon size={26} aria-hidden="true" /><h3>{title}</h3><p>{description}</p><ArrowUpRight size={18} aria-hidden="true" /></Link>;
  return <main className={styles.story} lang={fa ? "fa" : "en"} dir={fa ? "rtl" : "ltr"}>
    {schema}
    <section data-home-section="hero" className={styles.hero} aria-labelledby="growth-hero-title">
      <div className={styles.heroCopy}><span className={styles.eyebrow}><Mountain size={18} aria-hidden="true" />{t("تک‌پی · مسیر تو، با سرعت تو", "TecPey · Your path, at your pace")}</span>
        <h1 id="growth-hero-title">{t("از اولین قدم،", "From your first step,")}<br /><em>{t("تا کارنامهٔ مهارتی تو", "to a record of your skills")}</em></h1>
        <p>{t("خبر را بشناس، یاد بگیر و با سرمایهٔ مجازی تمرین کن. منتور تک‌پی در مسیر بازبینی تصمیم‌ها و ساختن عادت‌های بهتر همراه توست.", "Understand the news, build knowledge and practice with virtual capital. Your TecPey mentor helps you review decisions and develop better habits.")}</p>
        <div className={styles.actions}><Link className={styles.primary} href={link("/academy")}>{t("شروع آکادمی رایگان", "Start Free Academy")}<ArrowUpRight size={20} aria-hidden="true" /></Link><a className={styles.secondary} href="#story-news">{t("کشف مسیر رشد", "Explore the journey")}</a></div>
        <ul className={styles.heroProof}><li><BookOpen size={16} aria-hidden="true" />{t("آموزش مرحله‌ای", "Step-by-step learning")}</li><li><ShieldCheck size={16} aria-hidden="true" />{t("تمرین با سرمایه مجازی", "Virtual-capital practice")}</li><li><BrainCircuit size={16} aria-hidden="true" />{t("منتور همراه", "Mentor support")}</li></ul>
      </div>
      <figure className={styles.heroArt}><Image src="/images/landing/growth-mountain.webp" alt="" fill priority sizes="(max-width: 760px) 100vw, 58vw" /><figcaption>{t("هر قدم، فرصتی برای یادگیری", "Every step is a chance to learn")}</figcaption></figure>
    </section>
    <nav className={styles.chapterNav} aria-label={t("فصل‌های مسیر تک‌پی", "TecPey journey chapters")}>
      {[["story-news", t("اخبار", "News")], ["story-market", t("بازار", "Markets")], ["story-academy", t("آکادمی", "Academy")], ["story-league", t("لیگ", "League")], ["story-mastery", t("رشد بی‌نهایت", "Lifelong growth")]].map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
    </nav>
    <Chapter id="story-news" step="01" label={t("جهان را با زمینه ببین", "Start with context")} title={t("خبر را بخوان؛ زمینه و اثرش را بشناس", "Read the news. Understand the context.")} description={t("خبرهای منابع بین‌المللی، ترجمهٔ فارسی و خلاصهٔ آموزشی تک‌پی؛ با ارجاع به منبع اصلی و ارتباط با دارایی‌ها و درس‌ها. تحلیل تک‌پی از گزارش منبع متمایز است.", "International reporting with TecPey learning summaries, source attribution and links to assets and lessons. Original reporting remains distinct from TecPey context.")}>
      <div className={styles.valueRow}><span><Globe2 size={18} aria-hidden="true" />{t("منبع شفاف", "Source attribution")}</span><span><Newspaper size={18} aria-hidden="true" />{t("ترجمه و خلاصه", "Translation & context")}</span><span><Layers3 size={18} aria-hidden="true" />{t("ارتباط با بازار", "Market connections")}</span></div>
      <StoryNews locale={locale} />
    </Chapter>
    <Chapter id="story-market" step="02" label={t("نبض بازار", "The market pulse")} title={t("داده را ببین؛ بعد عمیق‌تر بررسی کن", "See the data. Then look closer.")} description={t("قیمت‌ها و نقشه تغییرات از سرویس بازار تک‌پی دریافت می‌شوند. منبع، مبنای قیمت و زمان داده کنار هم قرار دارند تا وضعیت بازار را با زمینه بخوانی.", "Prices and the change map use TecPey’s market service. Source, quote currency and data time stay visible so you can inspect the context.")}>
      <StoryMarketBoard locale={locale} />
      <details className={styles.details}><summary>{t("کوین‌ها و ابزارهای مرتبط با اخبار", "News-linked coins and tools")}</summary><Suspense fallback={<p role="status">{t("در حال دریافت…", "Loading…")}</p>}><Discovery promise={growthRadarPromise} locale={locale} /></Suspense></details>
    </Chapter>
    <Chapter id="story-academy" step="03" label={t("آموزش و همراهی", "Learning with support")} title={t("هفت ترم؛ پایه‌ای برای تصمیم آگاهانه", "Seven terms. A foundation for informed decisions.")} description={t("از مفاهیم پایه و امنیت تا تحلیل و روان‌شناسی؛ با درس، آزمون و مرور. مسیر کامل و شرایط هر ترم در آکادمی مشخص است.", "From foundations and security to analysis and psychology, with lessons, assessments and review. Explore the curriculum for each term’s content and requirements.")}>
      <ol className={styles.learningPath}>{curriculum.map((name, index) => <li key={name}><Link href={link(`/academy/term-${index + 1}`)}><span>{new Intl.NumberFormat(fa ? "fa-IR" : "en-US").format(index + 1)}</span><strong>{name}</strong></Link></li>)}</ol>
      <div className={styles.features}>
        {feature(GraduationCap, t("ادامه از قدم خودت", "Continue from your own step"), t("درس‌ها، مرور و پیشرفت ثبت‌شده‌ات را در آکادمی دنبال کن.", "Return to your lessons, reviews and recorded progress in the Academy."), link("/academy"))}
        {feature(BrainCircuit, t("منتور؛ همراه بازبینی", "A mentor for reflection"), t("دربارهٔ درس، خبر و تصمیم‌ها سؤال کن؛ منتور همراه یادگیری است و سیگنال خرید و فروش نمی‌فروشد.", "Ask about lessons, news and decisions. The mentor supports learning; it does not sell buy or sell signals."), link("/academy/ai-guide"))}
      </div>
    </Chapter>
    <Chapter id="story-practice" step="04" label={t("تمرین و بازتاب", "Practice and reflect")} title={t("تجربه بساز؛ تصمیم‌هایت را بازبینی کن", "Build experience. Review your decisions.")} description={t("آرنا محیط معامله با سرمایهٔ مجازی است. معاملهٔ بسته‌شده به ژورنال وصل می‌شود تا نتیجه، دلیل تصمیم و نکتهٔ آموخته‌شده کنار هم بمانند.", "Arena uses virtual capital. Closed trades connect to journal reflections, keeping the outcome, decision and lesson together.")}>
      <div className={styles.features}>
        {feature(LineChart, t("تریدینگ آرنا", "Trading Arena"), t("تمرین اجرای معامله و کنترل ریسک با سرمایهٔ مجازی؛ بدون پول واقعی.", "Practice execution and risk control with virtual capital: no real money involved."), link("/academy/trading-arena"))}
        {feature(NotebookPen, t("ژورنال تصمیم‌ها", "Your decision journal"), t("دلیل تصمیم، نتیجه و درس آموخته‌شده را بازبینی کن؛ در این تمرین پول، سود یا معاملهٔ واقعی وجود ندارد.", "Review your virtual practice: no real money, real profit or real trade takes place in it."), link("/academy/trading-arena"))}
      </div>
    </Chapter>
    <Chapter id="story-league" step="05" label={t("لیگ و پیشرفت", "League and progress")} title={t("رقابت در یادگیری، با معیار روشن", "Learning competition, with clear criteria")} description={t("رتبه‌های ماهانه و کلی از دادهٔ ثبت‌شده آرنا خوانده می‌شوند. نمایش اعضا تابع رضایت و شرایط لیگ است؛ حساب خودت را برای جزئیات بررسی کن.", "Monthly and all-time rankings come from recorded Arena evidence. Member visibility follows consent and league requirements; open your account for details.")}>
      <div className={styles.split}><StoryLeague locale={locale} /><aside className={styles.rewardInfo}><Trophy size={32} aria-hidden="true" /><h3>{t("جوایز نقدی و غیرنقدی", "Cash and non-cash rewards")}</h3><span className={styles.status}>{t("در حال آماده‌سازی", "In preparation")}</span><p>{t("پرداخت نقدی و اعطای خودکار پاداش در نسخهٔ فعلی فعال نیست. نوع، بودجه و شرایط دریافت باید پیش از شروع هر دوره اعلام شود.", "Cash payouts and automatic reward grants are not active in the current version. Types, budgets and eligibility must be published before a reward cycle begins.")}</p><details className={styles.details}><summary>{t("روش مشارکت و شرایط", "Participation and conditions")}</summary><p>{t("با حساب آکادمی، تمرین‌های معتبر و تنظیمات رضایت نمایش رتبه شرکت کن. خرید اشتراک جای امتیاز مهارتی را نمی‌گیرد. جوایز برنامه‌ریزی‌شده، طلب مالی یا نتیجه قطعی ایجاد نمی‌کنند.", "Use an Academy account, eligible practice evidence and ranking visibility consent. A subscription does not replace skill evidence. Planned rewards are not an awarded balance or a confirmed outcome.")}</p></details></aside></div>
    </Chapter>
    <section data-home-section="pro-gift" className={styles.gift} aria-labelledby="gift-title"><Gift size={42} aria-hidden="true" /><div><span className={styles.status}>{t("هدیهٔ برنامه‌ریزی‌شده", "Planned graduation gift")}</span><h2 id="gift-title">{t("پایان ترم ۷؛ یک ماه Pro هدیه", "Complete Term 7: one month of Pro")}</h2><p>{t("برای همهٔ تکمیل‌کنندگان واجد شرایط، مستقل از رتبهٔ لیگ. اعطای خودکار هنوز فعال نشده است؛ شرایط فعال‌سازی در حساب آکادمی اعلام خواهد شد.", "For all eligible graduates, independent of league rank. Automatic grants are not active yet; activation terms will be published in the Academy account.")}</p></div></section>
    <Chapter id="story-mastery" step="08" label={t("مسیر ادامه دارد", "The journey continues")} title={t("ترم ۸؛ رشد بی‌نهایت", "Term 8. Lifelong growth.")} description={t("بعد از ثبت قبولی هفت ترم، وارد فصل‌های رشد می‌شوی: ترمیم ضعف‌ها، یادگیری از خبرهای روز، تمرین انضباط و مسیر هم‌سطح‌ها. هدف، یک برنامهٔ متناسب با شواهد پیشرفت توست.", "After passing all seven terms, explore growth seasons: repair weak areas, learn from current news, practice discipline and grow with peers. Your path follows evidence of your progress.")} mountain>
      <div className={styles.masterySteps}>{[[Target, t("هدف مشخص", "A specific goal"), t("شناخت مهارت نیازمند تمرین", "Identify a skill to practice")], [Repeat2, t("تمرین متناسب", "Relevant practice"), t("تمرین و مرور در مسیر رشد", "Practice and review within a season")], [BrainCircuit, t("بازبینی با منتور", "Mentor reflection"), t("بررسی تصمیم‌ها و نکته‌های آموخته‌شده", "Review decisions and lessons learned")], [FileCheck2, t("کارنامهٔ مهارتی", "A record of skills"), t("ثبت شواهد یادگیری و نمونه‌کار", "Build evidence of learning and practice")]].map(([Icon, title, description]) => { const Symbol = Icon as typeof Target; return <div key={String(title)}><Symbol size={24} aria-hidden="true" /><h3>{String(title)}</h3><p>{String(description)}</p></div>; })}</div>
      <div className={styles.actions}><Link href={link("/academy/term-8")} className={styles.primary}>{t("کشف فصل‌های رشد", "Explore growth seasons")}<ArrowUpRight size={18} aria-hidden="true" /></Link><Link href={link("/academy/profile")} className={styles.secondary}>{t("پیشرفت و مسیر شخصی من", "My progress and personal path")}</Link></div>
    </Chapter>
    <Chapter id="story-exchange" step="09" label={t("در حال توسعه", "In development")} title={t("صرافی تک‌پی؛ معامله، همراه با بازبینی منتور", "TecPey Exchange. Trading with mentor reflection.")} description={t("در حال ساخت و توسعه صرافی اختصاصی و پیشرفته تک‌پی هستیم. تحلیل معاملات واقعی با منتور، ژورنال متصل و بررسی هزینه و کیفیت اجرا بخشی از مسیر توسعهٔ این ابزار است.", "We are developing TecPey’s dedicated exchange. Mentor analysis of real trades, a connected journal, and execution-cost review are part of this product’s development path.")}>
      <details className={styles.details}><summary>{t("آشنایی با صرافی تک‌پی", "Discover TecPey Exchange")}</summary><p>{t("این بخش معرفی مسیر توسعه است. معاملهٔ واقعی و تحلیل متصل به آن هنوز از این لندینگ فعال نمی‌شوند. آرنا همچنان محیط سرمایهٔ مجازی است؛ دسترسی منتور به تحلیل به معنی اجازهٔ اجرای معامله نیست.", "This introduces a product in development. Real trading and its connected analysis are not activated from this landing page. Arena remains virtual; mentor analysis is not permission to execute a trade.")}</p></details>
    </Chapter>
    <section data-home-section="resume" className={styles.close}><FileCheck2 size={36} aria-hidden="true" /><h2>{t("پیشرفتت را با شواهد نشان بده", "Let evidence show your progress")}</h2><p>{t("درس‌ها، ارزیابی‌ها و تجربهٔ تمرینت را در کارنامه دنبال کن. رزومهٔ مهارتی از یادگیری ساخته می‌شود؛ قدم بعدی می‌تواند همین امروز باشد.", "Follow your lessons, assessments and practice in your learning record. A skills portfolio starts with learning. Take your next step today.")}</p><div className={styles.actions}><Link href={link("/academy")} className={styles.primary}>{t("شروع آکادمی رایگان", "Start Free Academy")}<CheckCheck size={18} aria-hidden="true" /></Link><Link className={styles.textLink} href={link("/academy/profile")}>{t("مشاهده کارنامه من", "View my learning record")}</Link></div></section>
  </main>;
}
