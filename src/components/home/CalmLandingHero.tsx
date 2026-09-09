import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./calm-entry.module.css";

/** Apple-inspired hierarchy, not an implementation of Apple's native materials. */
export function CalmLandingHero({ locale = "fa" }: { locale?: "fa" | "en" }) {
  const fa = locale === "fa";
  const prefix = fa ? "" : "/en";
  const Arrow = fa ? ArrowLeft : ArrowRight;
  return (
    <section data-home-section="hero" className={styles.hero} dir={fa ? "rtl" : "ltr"}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{fa ? "تک‌پی، همراه یادگیری شما" : "TecPey. Learn with confidence."}</p>
        <h1>{fa ? "آگاهانه یاد بگیر. با اطمینان تمرین کن." : "Build your knowledge. Practice with confidence."}</h1>
        <p className={styles.description}>{fa ? "آموزش رایگان رمزارز، تمرین با سرمایه مجازی و منتور آموزشی؛ در یک مسیر روشن، با سرعت خودت." : "Free crypto education, virtual practice and an educational mentor. One clear path, at your own pace."}</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href={`${prefix}/academy`}>{fa ? "شروع آکادمی رایگان" : "Start Free Academy"}<Arrow size={18} aria-hidden="true" /></Link>
          <Link className={styles.secondary} href={`${prefix}/academy/ai-guide`}>{fa ? "گفتگو با منتور هوشمند" : "Talk to AI Mentor"}</Link>
        </div>
      </div>
      <figure className={styles.visual}>
        <Image src="/images/brand/academy-auth-crystal.jpeg" alt="" fill priority sizes="(max-width: 760px) 100vw, 48vw" />
        <figcaption>{fa ? "یادگیری، پیش از تصمیم مالی." : "Learning comes before financial decisions."}</figcaption>
      </figure>
    </section>
  );
}
