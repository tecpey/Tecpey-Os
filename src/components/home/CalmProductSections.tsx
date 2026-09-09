import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, MessageCircle, ShieldCheck, Trophy } from "lucide-react";
import styles from "./calm-entry.module.css";

type Props = { locale: "fa" | "en" };

export function CalmMentorSection({ locale }: Props) {
  const fa = locale === "fa";
  const Arrow = fa ? ArrowLeft : ArrowRight;
  return (
    <section className={styles.productSection} aria-labelledby={`mentor-title-${locale}`} dir={fa ? "rtl" : "ltr"}>
      <div className={styles.productHeading}>
        <MessageCircle size={28} aria-hidden="true" />
        <h2 id={`mentor-title-${locale}`}>{fa ? "جایی برای سؤال‌های تو." : "Room for your questions."}</h2>
        <p>{fa ? "وقتی درسی مبهم است یا تمرینی سخت می‌شود، از منتور آموزشی کمک بگیر. قدم بعدی را با درک بهتر بردار." : "When a lesson feels unclear or practice gets difficult, ask your educational mentor. Take the next step with understanding."}</p>
        <Link className={styles.secondary} href={fa ? "/academy/ai-guide" : "/en/academy/ai-guide"}>{fa ? "آشنایی با منتور" : "Meet your mentor"}<Arrow size={18} aria-hidden="true" /></Link>
      </div>
      <div className={styles.mentorNote}>
        <h3>{fa ? "راهنمای یادگیری، نه سیگنال معامله." : "Learning guidance. Not trading signals."}</h3>
        <p>{fa ? "توضیح مفاهیم، مرور تمرین‌ها و کمک به شناخت ریسک. پاسخ‌های هوش مصنوعی ممکن است اشتباه باشند؛ اطلاعات مهم را با منابع معتبر بررسی کن." : "Explore concepts, review practice and understand risk. AI can make mistakes; verify important information with reliable sources."}</p>
        <p className={styles.smallNote}>{fa ? "برای ادامه گفتگو وارد حساب آموزشی شو. رمز عبور و اطلاعات محرمانه را در چت نفرست." : "Sign in to your learning account to continue. Never share passwords or secrets in chat."}</p>
      </div>
    </section>
  );
}

export function CalmLearningSection({ locale }: Props) {
  const fa = locale === "fa";
  const prefix = fa ? "" : "/en";
  const items = fa ? [
    { icon: BookOpen, title: "پایه‌ات را محکم کن", text: "درس‌های مرحله‌ای درباره رمزارز، امنیت و مدیریت ریسک.", href: "/academy/curriculum", link: "مشاهده سرفصل‌ها" },
    { icon: Trophy, title: "تصمیمت را تمرین کن", text: "در تریدینگ آرنا با سرمایه مجازی تمرین کن؛ بدون واریز پول واقعی.", href: "/academy/trading-arena", link: "آشنایی با تریدینگ آرنا" },
  ] : [
    { icon: BookOpen, title: "Build your foundation", text: "Structured lessons in crypto, account security and risk management.", href: "/academy/curriculum", link: "Explore the curriculum" },
    { icon: Trophy, title: "Practice your decisions", text: "Practice in Trading Arena with virtual funds. No real-money deposit.", href: "/academy/trading-arena", link: "Explore Trading Arena" },
  ];
  return (
    <section className={styles.learningSection} aria-labelledby={`learning-title-${locale}`} dir={fa ? "rtl" : "ltr"}>
      <header className={styles.productHeading}>
        <h2 id={`learning-title-${locale}`}>{fa ? "از فهمیدن تا تمرین کردن." : "From understanding to practice."}</h2>
        <p>{fa ? "از سطح خودت شروع کن. درس را یاد بگیر، درک خودت را بسنج و آموخته‌ها را در محیط مجازی امتحان کن." : "Start at your level. Learn a concept, check your understanding and put it into practice in a virtual environment."}</p>
      </header>
      <div className={styles.learningGrid}>
        {items.map(({ icon: Icon, title, text, href, link }) => <article key={href} className={styles.learningItem}>
          <Icon size={28} aria-hidden="true" />
          <h3>{title}</h3><p>{text}</p>
          <Link href={`${prefix}${href}`} className={styles.textLink}>{link}</Link>
        </article>)}
      </div>
    </section>
  );
}

export function LandingDetails({ locale, children }: Props & { children: ReactNode }) {
  return <details className={styles.extendedDetails} dir={locale === "fa" ? "rtl" : "ltr"}>
    <summary>{locale === "fa" ? "راهنمای کامل تکپی و جزئیات مسیرهای آموزشی" : "Complete TecPey guide and learning pathway details"}</summary>
    <div className={styles.extendedContent}>{children}</div>
  </details>;
}

export function CalmLandingClose({ locale }: Props) {
  const fa = locale === "fa";
  const prefix = fa ? "" : "/en";
  const faq = fa ? [
    ["آموزش آکادمی رایگان است؟", "بله، مسیر پایه آکادمی رایگان است. برنامه‌های تخصصی و گواهی‌های رسمی ممکن است شرایط جداگانه داشته باشند."],
    ["آرنا با پول واقعی کار می‌کند؟", "خیر. تریدینگ آرنا محیط تمرین با سرمایه مجازی است؛ نتیجه تمرین، سود یا زیان واقعی ایجاد نمی‌کند."],
    ["حساب آموزشی همان حساب صرافی است؟", "خیر. ورود آموزشی از این سایت انجام می‌شود. ورود حساب صرافی در دامنه رسمی my.tecpey.ir جداست."],
    ["منتور توصیه خرید و فروش می‌دهد؟", "منتور برای توضیح و یادگیری است، نه مشاوره سرمایه‌گذاری یا تضمین سود. پاسخ‌های مهم را بررسی کن."],
  ] : [
    ["Is Academy free?", "Yes, the foundation learning path is free. Specialist programs and official certificates may have separate terms."],
    ["Does Arena use real money?", "No. Trading Arena uses virtual funds. Practice results do not create real profits or losses."],
    ["Is this also my exchange account?", "No. Learning accounts use this site. Exchange sign-in is separate at the official my.tecpey.ir domain."],
    ["Does the mentor give buy or sell advice?", "The mentor supports learning, not investment advice or guaranteed returns. Verify important answers."],
  ];
  return <div className={styles.landingClose} dir={fa ? "rtl" : "ltr"}>
    <section className={styles.trustNote} aria-labelledby={`trust-title-${locale}`}>
      <ShieldCheck size={28} aria-hidden="true" />
      <div><h2 id={`trust-title-${locale}`}>{fa ? "شفاف، از همان ابتدا." : "Clear from the start."}</h2>
        <p>{fa ? "نسخه فعلی برای آموزش و تمرین مجازی است. خدمات پول واقعی این پلتفرم فعال نیست و هیچ تضمین سودی ارائه نمی‌شود." : "This release is for education and virtual practice. Real-money services on this platform are not active. No returns are guaranteed."}</p>
        <Link href={`${prefix}/risk-disclosure`} className={styles.textLink}>{fa ? "مطالعه بیانیه ریسک" : "Read the risk disclosure"}</Link>
      </div>
    </section>
    <section className={styles.faq} aria-labelledby={`faq-title-${locale}`}>
      <h2 id={`faq-title-${locale}`}>{fa ? "پیش از شروع، بدان." : "Before you begin."}</h2>
      {faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
    </section>
    <section className={styles.closingCta}>
      <Image src="/images/brand/tecpey-logo-256.png" alt="TecPey" width={56} height={56} />
      <h2>{fa ? "قدم بعدی، با تو." : "Your next step starts here."}</h2>
      <p>{fa ? "حساب آموزشی بساز تا مسیر یادگیری‌ات را ادامه بدهی." : "Create a learning account and make progress at your own pace."}</p>
      <Link href={`${prefix}/academy/signup`} className={styles.primary}>{fa ? "ساخت حساب آموزشی" : "Create a learning account"}</Link>
      <Link href={`${prefix}/academy/login`} className={styles.textLink}>{fa ? "حساب داری؟ وارد شو" : "Already a member? Sign in"}</Link>
    </section>
  </div>;
}
