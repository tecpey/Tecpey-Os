"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, MapPin, Phone, Smartphone } from "lucide-react";
import { FaDiscord, FaInstagram } from "react-icons/fa6";
import { FaTelegramPlane } from "react-icons/fa";

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

const trustSignals = [
  {
    title: "نماد اعتماد الکترونیکی",
    status: "در حال اقدام",
    note: "فرآیند دریافت و تأیید نهایی هنوز تکمیل نشده است",
    image: "/assets/trust/enamad.png",
    href: "https://enamad.ir/",
  },
  {
    title: "عضویت صنفی حوزه بلاکچین",
    status: "در حال اقدام",
    note: "بررسی الزامات و تعامل صنفی در حال پیگیری است",
    image: "/assets/trust/mojavez.png",
    href: "https://iranblockchain.org/",
  },
  {
    title: "ثبت و ساماندهی رسانه دیجیتال",
    status: "در حال اقدام",
    note: "فرآیند ثبت رسانه و تأیید اطلاعات در جریان است",
    image: "/assets/trust/samandehi.png",
    href: "https://samandehi.ir/",
  },
  {
    title: "عضویت تخصصی فناوری بلاکچین",
    status: "در حال اقدام",
    note: "عضویت تخصصی پس از تکمیل بررسی‌ها اعلام خواهد شد",
    image: "/assets/trust/blockchain-association.png",
    href: "https://iranblockchain.org/",
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

const contactItemsFa = [
  { icon: MapPin, label: "دفتر", value: "مازندران، بابل، چهارراه تندست، جنب کریستال، دفتر تک‌پی", href: "/contact-us" },
  { icon: Phone, label: "تلفن", value: "۰۱۱۳۲۳۳۸۰۲۶", href: "tel:01132338026" },
  { icon: Smartphone, label: "همراه", value: "۰۹۱۱۱۱۶۶۴۴۰", href: "tel:09111166440" },
  { icon: Mail, label: "ایمیل عمومی", value: "info@tecpey.ir", href: "mailto:info@tecpey.ir" },
  { icon: Mail, label: "ایمیل پشتیبانی", value: "support@tecpey.ir", href: "mailto:support@tecpey.ir" },
];

const contactItemsEn = [
  { icon: MapPin, label: "Office", value: "Mazandaran, Babol, TecPey office", href: "/en/contact-us" },
  { icon: Phone, label: "Phone", value: "+98 11 3233 8026", href: "tel:+981132338026" },
  { icon: Smartphone, label: "Mobile", value: "+98 911 116 6440", href: "tel:+989111166440" },
  { icon: Mail, label: "General Email", value: "info@tecpey.ir", href: "mailto:info@tecpey.ir" },
  { icon: Mail, label: "Support Email", value: "support@tecpey.ir", href: "mailto:support@tecpey.ir" },
];

const socialLinks = [
  { label: "تلگرام تک‌پی", href: "https://t.me/tecpeyco", icon: FaTelegramPlane },
  { label: "اینستاگرام تک‌پی", href: "https://instagram.com/tecpeyco", icon: FaInstagram },
  { label: "دیسکورد تک‌پی", href: "https://discord.gg/tecpeyex", icon: FaDiscord },
];

const socialLinksEn = [
  { label: "Official TecPey Telegram", href: "https://t.me/tecpeyco", icon: FaTelegramPlane },
  { label: "Official TecPey Instagram", href: "https://instagram.com/tecpeyco", icon: FaInstagram },
  { label: "Official TecPey Discord", href: "https://discord.gg/tecpeyex", icon: FaDiscord },
];

function isFooterActive(pathname: string, href: string) {
  if (href === "/" || href === "/en") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function footerLinkClass(active: boolean) {
  return `text-sm font-bold leading-7 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${active ? "text-cyan-300" : "text-white/70 hover:text-cyan-200"}`;
}

function ContactPanel({ isEnglish }: { isEnglish: boolean }) {
  const items = isEnglish ? contactItemsEn : contactItemsFa;
  const socials = isEnglish ? socialLinksEn : socialLinks;
  return (
    <section className="rounded-[30px] border border-cyan-300/15 bg-white/[0.035] p-5">
      <Link href={isEnglish ? "/en" : "/"} className="inline-flex items-center" aria-label="TecPey Home">
        <Image src="/images/tecpey-logo.png" alt="TecPey" width={200} height={58} className="h-[58px] w-auto object-contain" />
      </Link>
      <p className="mt-4 text-sm font-bold leading-8 text-white/68">
        {isEnglish
          ? "TecPey — Your Safe Entry Point to the Crypto Market. Education, security, risk awareness and responsible crypto market entry."
          : "تک‌پی، نقطه امن ورود به بازار رمزارز؛ یک مسیر یکپارچه برای آموزش، تمرین، شناخت ریسک و ورود مسئولانه به بازار."}
      </p>
      <div className="mt-5 grid gap-3">
        {items.map((item) => (
          <Link key={item.label} href={item.href} className="flex items-start gap-3 rounded-2xl bg-white/[0.04] p-3 transition hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <item.icon className="mt-1 h-5 w-5 shrink-0 text-cyan-300" />
            <span className="text-sm leading-7 text-white/75"><strong className="text-white">{item.label}: </strong>{item.value}</span>
          </Link>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        {socials.map((item) => (
          <Link key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" aria-label={item.label} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl text-white/80 transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <item.icon />
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Footer({ metaData: _metaData }: { metaData?: any }) {
  const year = new Date().getFullYear();
  const pathname = usePathname();
  const isEnglish = pathname.startsWith("/en");

  return (
    <footer dir={isEnglish ? "ltr" : "rtl"} className="border-t border-white/10 bg-[#06111f] px-4 py-14 text-white md:px-8">
      <div className="mx-auto max-w-7xl">
        {isEnglish ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <ContactPanel isEnglish />
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
          <>
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

            <div className="mt-7 rounded-[30px] border border-cyan-300/15 bg-white/[0.035] p-5">
              <h3 className="text-xl font-black text-white">وضعیت اعتماد، ثبت و مجوزهای تک‌پی</h3>
              <p className="mt-2 max-w-4xl text-sm font-bold leading-8 text-white/62">
                موارد زیر هنوز نهایی یا تأیید نشده‌اند و صرفاً وضعیت پیگیری فرایندهای رسمی را نشان می‌دهند. تک‌پی پس از دریافت هر تأیید معتبر، وضعیت و مستندات قابل استناد آن را در همین بخش منتشر می‌کند.
              </p>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {trustSignals.map((item) => (
                <Link key={item.title} href={item.href} target="_blank" rel="noopener noreferrer" className="group relative flex min-h-[230px] flex-col justify-between overflow-hidden rounded-[30px] border border-cyan-300/15 bg-[#071827]/80 p-5 shadow-[0_18px_55px_rgba(0,0,0,.20)] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-[0_24px_70px_rgba(34,211,238,.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label={`${item.title} - ${item.status}`}>
                  <span className="absolute right-4 top-4 rounded-full border border-amber-300/35 bg-amber-300/12 px-3 py-1 text-[11px] font-black text-amber-100">{item.status}</span>
                  <div className="flex min-h-[130px] items-center justify-center pt-8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image} alt={item.title} className="max-h-32 max-w-[190px] object-contain opacity-100 drop-shadow-[0_0_18px_rgba(34,211,238,.18)] transition group-hover:scale-105" />
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3 text-center">
                    <h4 className="text-sm font-black leading-7 text-white">{item.title}</h4>
                    <p className="mt-1 text-xs font-bold leading-6 text-cyan-200/80">{item.note}</p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-6">
              <ContactPanel isEnglish={false} />
            </div>
          </>
        )}

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs leading-6 text-white/50 md:flex-row md:items-center md:justify-between">
          <p>© 2025–{year} TecPey. {isEnglish ? "All rights reserved." : "تمامی حقوق محفوظ است."}</p>
          <p>{isEnglish ? "Official site: tecpey.ir | Email: info@tecpey.ir" : "نشانی رسمی: tecpey.ir | ایمیل رسمی: info@tecpey.ir"}</p>
        </div>
      </div>
    </footer>
  );
}
