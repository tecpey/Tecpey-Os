"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const footerSquareGroups = [
  {
    title: "تک‌پی",
    links: [
      { label: "درباره تک‌پی", href: "/about" },
      { label: "چرا تک‌پی؟", href: "/why-tecpey" },
      { label: "امنیت", href: "/security" },
      { label: "بیانیه ریسک", href: "/risk-disclosure" },
      { label: "قوانین", href: "/rules" },
      { label: "تماس با ما", href: "/contact-us" },
    ],
  },
  {
    title: "بازار و معامله",
    links: [
      { label: "مارکت برد آنلاین", href: "/markets" },
      { label: "رمزارزها", href: "/coins" },
      { label: "اخبار رمزارز", href: "/crypto-news" },
      { label: "کارمزدها", href: "/fees" },
      { label: "راهنمای شروع", href: "/start-guide" },
      { label: "قیمت بیت‌کوین", href: "/price/bitcoin" },
      { label: "قیمت تتر", href: "/price/tether" },
    ],
  },
  {
    title: "آموزش و تمرین",
    links: [
      { label: "آکادمی تک‌پی", href: "/academy" },
      { label: "تریدینگ آرنا", href: "/academy/trading-arena" },
      { label: "منتور هوشمند", href: "/academy/ai-guide" },
      { label: "مرکز یادگیری", href: "/learn" },
      { label: "جعبه ابزار معامله‌گر", href: "/trading-tools" },
      { label: "واژه‌نامه رمزارز", href: "/glossary" },
      { label: "سؤالات پرتکرار", href: "/faq" },
      { label: "مقایسه صرافی‌ها", href: "/compare" },
    ],
  },
  {
    title: "همکاری و پشتیبانی",
    links: [
      { label: "مرکز پشتیبانی", href: "/support" },
      { label: "همکاری با تک‌پی", href: "/partners" },
      { label: "راهکار کسب‌وکار", href: "/business" },
      { label: "درخواست لیست شدن", href: "/listing" },
      { label: "رسانه و برند", href: "/media" },
    ],
  },
];

const footerSectionsEn = [
  {
    title: "TecPey",
    links: [
      { label: "About TecPey", href: "/en/about" },
      { label: "Why TecPey?", href: "/en/why-tecpey" },
      { label: "Security", href: "/en/security" },
      { label: "Transparency", href: "/en/transparency" },
      { label: "Risk Disclosure", href: "/en/risk-disclosure" },
      { label: "Methodology", href: "/en/methodology" },
      { label: "Editorial Policy", href: "/en/editorial-policy" },
      { label: "Contact", href: "/en/contact-us" },
    ],
  },
  {
    title: "Markets & Trading",
    links: [
      { label: "Markets", href: "/en/markets" },
      { label: "Coins", href: "/en/coins" },
      { label: "Crypto News", href: "/en/crypto-news" },
      { label: "Fees", href: "/en/fees" },
      { label: "Start Guide", href: "/en/start-guide" },
      { label: "Rules", href: "/en/rules" },
      { label: "Privacy", href: "/en/privacy" },
      { label: "Listing", href: "/en/listing" },
      { label: "Swap", href: "/en/swap" },
    ],
  },
  {
    title: "Academy & Practice",
    links: [
      { label: "Academy", href: "/en/academy" },
      { label: "Trading Arena", href: "/en/academy/trading-arena" },
      { label: "AI Learning Mentor", href: "/en/academy/ai-guide" },
      { label: "Trader Toolbox", href: "/en/trading-tools" },
      { label: "Crypto Glossary", href: "/en/glossary" },
      { label: "FAQ", href: "/en/faq" },
      { label: "Exchange Comparisons", href: "/en/compare" },
      { label: "Support Center", href: "/en/support" },
      { label: "Security Center", href: "/en/security" },
    ],
  },
];

function isFooterActive(pathname: string, href: string) {
  if (href === "/" || href === "/en") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function footerLinkClass(active: boolean) {
  return `text-sm font-bold leading-7 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${active ? "text-cyan-300" : "text-white/70 hover:text-cyan-200"}`;
}

export default function Footer() {
  const year = new Date().getFullYear();
  const pathname = usePathname();
  const isEnglish = pathname.startsWith("/en");

  return (
    <footer dir={isEnglish ? "ltr" : "rtl"} className="border-t border-white/10 bg-[#06111f] px-4 py-14 text-white md:px-8">
      <div className="mx-auto max-w-7xl">
        {isEnglish ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {footerSectionsEn.map((section) => (
              <section key={section.title} className="min-h-[270px] rounded-[30px] border border-white/10 bg-white/[0.035] p-5">
                <h3 className="text-lg font-black text-white">{section.title}</h3>
                <ul className="mt-5 space-y-3">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className={footerLinkClass(isFooterActive(pathname, link.href))}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {footerSquareGroups.map((group) => (
                <section key={group.title} className="min-h-[230px] rounded-[30px] border border-cyan-300/15 bg-white/[0.035] p-5 shadow-[0_18px_55px_rgba(0,0,0,.18)]">
                  <h3 className="text-lg font-black text-white">{group.title}</h3>
                  <ul className="mt-5 space-y-3">
                    {group.links.map((item) => (
                      <li key={item.href}>
                        <Link href={item.href} className={footerLinkClass(isFooterActive(pathname, item.href))}>{item.label}</Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
        )}

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs leading-6 text-white/50 md:flex-row md:items-center md:justify-between">
          <p>© 2025–{year} TecPey. {isEnglish ? "All rights reserved." : "تمامی حقوق محفوظ است."}</p>
          <p>{isEnglish ? "Official site: tecpey.ir" : "نشانی رسمی: tecpey.ir"}</p>
        </div>
      </div>
    </footer>
  );
}
