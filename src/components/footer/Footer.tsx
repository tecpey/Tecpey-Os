"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const faGroups = [
  { title: "تک‌پی", links: [
    ["درباره تک‌پی", "/about"], ["چرا تک‌پی؟", "/why-tecpey"], ["امنیت", "/security"], ["شفافیت", "/transparency"], ["بیانیه ریسک", "/risk-disclosure"], ["قوانین", "/rules"], ["تماس با ما", "/contact-us"],
  ] },
  { title: "بازار و معامله", links: [
    ["مارکت برد آنلاین", "/markets"], ["رمزارزها", "/coins"], ["اخبار رمزارز", "/crypto-news"], ["کارمزدها", "/fees"], ["راهنمای شروع", "/start-guide"], ["مقایسه صرافی‌ها", "/compare"], ["سواپ", "/swap"],
  ] },
  { title: "آموزش و تمرین", links: [
    ["آکادمی تک‌پی", "/academy"], ["تریدینگ آرنا", "/academy/trading-arena"], ["منتور هوشمند", "/academy/ai-guide"], ["مرکز یادگیری", "/learn"], ["جعبه ابزار معامله‌گر", "/trading-tools"], ["واژه‌نامه رمزارز", "/glossary"], ["سؤالات پرتکرار", "/faq"],
  ] },
  { title: "همکاری و پشتیبانی", links: [
    ["مرکز پشتیبانی", "/support"], ["همکاری با تک‌پی", "/partners"], ["راهکار کسب‌وکار", "/business"], ["درخواست لیست شدن", "/listing"], ["رسانه و برند", "/media"], ["سیاست تحریریه", "/editorial-policy"], ["روش‌شناسی", "/methodology"],
  ] },
] as const;

const enGroups = [
  { title: "TecPey", links: [
    ["About TecPey", "/en/about"], ["Why TecPey?", "/en/why-tecpey"], ["Security", "/en/security"], ["Transparency", "/en/transparency"], ["Risk Disclosure", "/en/risk-disclosure"], ["Rules", "/en/rules"], ["Contact", "/en/contact-us"],
  ] },
  { title: "Markets & Trading", links: [
    ["Markets", "/en/markets"], ["Coins", "/en/coins"], ["Crypto News", "/en/crypto-news"], ["Fees", "/en/fees"], ["Start Guide", "/en/start-guide"], ["Exchange Comparisons", "/en/compare"], ["Swap", "/en/swap"],
  ] },
  { title: "Academy & Practice", links: [
    ["Academy", "/en/academy"], ["Trading Arena", "/en/academy/trading-arena"], ["AI Learning Mentor", "/en/academy/ai-guide"], ["Trader Toolbox", "/en/trading-tools"], ["Crypto Glossary", "/en/glossary"], ["FAQ", "/en/faq"], ["News Quiz", "/en/academy/news-quiz"],
  ] },
  { title: "Collaboration & Support", links: [
    ["Support Center", "/en/support"], ["Partners", "/en/partners"], ["Business Solutions", "/en/business"], ["Listing Request", "/en/listing"], ["Media & Brand", "/en/media"], ["Editorial Policy", "/en/editorial-policy"], ["Methodology", "/en/methodology"],
  ] },
] as const;

function active(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Footer() {
  const pathname = usePathname();
  const isEnglish = pathname.startsWith("/en");
  const groups = isEnglish ? enGroups : faGroups;
  const year = new Date().getFullYear();

  return (
    <footer dir={isEnglish ? "ltr" : "rtl"} className="border-t border-white/10 bg-[#06111f] px-4 py-12 text-white md:px-8">
      <div className="mx-auto max-w-[1480px]">
        <nav aria-label={isEnglish ? "TecPey footer navigation" : "ناوبری پایین تک‌پی"} className="rounded-[34px] border border-cyan-300/15 bg-white/[0.035] p-3 shadow-[0_22px_75px_rgba(0,0,0,.22)] sm:p-5">
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-4">
            {groups.map((group) => (
              <section key={group.title} className="min-w-[78vw] snap-start rounded-[26px] border border-white/8 bg-black/10 p-5 sm:min-w-[330px] md:min-w-0">
                <h2 className="text-base font-black text-white sm:text-lg">{group.title}</h2>
                <ul className="mt-4 grid gap-2.5">
                  {group.links.map(([label, href]) => (
                    <li key={href}><Link href={href} aria-current={active(pathname, href) ? "page" : undefined} className={`inline-flex min-h-8 items-center rounded-lg text-sm font-bold leading-6 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${active(pathname, href) ? "text-cyan-300" : "text-white/68 hover:text-cyan-100"}`}>{label}</Link></li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="mt-3 px-2 text-[10px] font-bold text-white/35 md:hidden">{isEnglish ? "Swipe horizontally to explore all footer sections." : "برای مشاهده همه بخش‌ها، باکس را به‌صورت افقی اسکرول کنید."}</p>
        </nav>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs leading-6 text-white/45 md:flex-row md:items-center md:justify-between">
          <p>© 2025–{year} TecPey. {isEnglish ? "All rights reserved." : "تمامی حقوق محفوظ است."}</p>
          <p>{isEnglish ? "Official site: tecpey.ir" : "نشانی رسمی: tecpey.ir"}</p>
        </div>
      </div>
    </footer>
  );
}
