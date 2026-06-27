"use client";

import { useEffect, useMemo, useState } from "react";
import { PlayCircle, Maximize2, X, CheckCircle2, Lock, Trophy, Zap } from "lucide-react";

type Section = { heading: string; body: readonly string[] };

type AcademyVideo = {
  title: string;
  provider: string;
  teacher: string;
  duration: string;
  level: string;
  language: string;
  embedUrl: string;
  sourceUrl: string;
  description: string;
  thumbnailUrl: string;
};

type VideoPair = { primary: AcademyVideo; secondary: AcademyVideo };

function yt(id: string) {
  return {
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
  };
}

const ACADEMY_VIDEO_LIBRARY: Record<string, VideoPair> = {
  "term-1-lesson-1": {
    primary: { title: "پول، تورم و چرایی کریپتو — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("41-v10uRlsA"), sourceUrl: "https://www.youtube.com/watch?v=41-v10uRlsA", description: "ویدیوی کوتاه و مرتبط با مبحث «پول، تورم و چرایی کریپتو» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "پول، تورم و چرایی کریپتو — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("SSo_EIwHSd4"), sourceUrl: "https://www.youtube.com/watch?v=SSo_EIwHSd4", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «پول، تورم و چرایی کریپتو». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-1-lesson-2": {
    primary: { title: "بیت‌کوین و ایده پول غیرمتمرکز — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("Gc2en3nHxA4"), sourceUrl: "https://www.youtube.com/watch?v=Gc2en3nHxA4", description: "ویدیوی کوتاه و مرتبط با مبحث «بیت‌کوین و ایده پول غیرمتمرکز» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "بیت‌کوین و ایده پول غیرمتمرکز — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("bBC-nXj3Ng4"), sourceUrl: "https://www.youtube.com/watch?v=bBC-nXj3Ng4", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «بیت‌کوین و ایده پول غیرمتمرکز». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-1-lesson-3": {
    primary: { title: "بلاکچین به زبان ساده — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("SSo_EIwHSd4"), sourceUrl: "https://www.youtube.com/watch?v=SSo_EIwHSd4", description: "ویدیوی کوتاه و مرتبط با مبحث «بلاکچین به زبان ساده» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "بلاکچین به زبان ساده — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("Yn8WGaO__ak"), sourceUrl: "https://www.youtube.com/watch?v=Yn8WGaO__ak", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «بلاکچین به زبان ساده». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-1-lesson-4": {
    primary: { title: "کیف پول و کلید خصوصی — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("SQyg9pyJ1Ac"), sourceUrl: "https://www.youtube.com/watch?v=SQyg9pyJ1Ac", description: "ویدیوی کوتاه و مرتبط با مبحث «کیف پول و کلید خصوصی» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "کیف پول و کلید خصوصی — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("AcrEEnDLm58"), sourceUrl: "https://www.youtube.com/watch?v=AcrEEnDLm58", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «کیف پول و کلید خصوصی». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-1-lesson-5": {
    primary: { title: "صرافی در برابر کیف پول — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("Aq3a-_O2NcI"), sourceUrl: "https://www.youtube.com/watch?v=Aq3a-_O2NcI", description: "ویدیوی کوتاه و مرتبط با مبحث «صرافی در برابر کیف پول» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "صرافی در برابر کیف پول — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("p2yLJtGb6LE"), sourceUrl: "https://www.youtube.com/watch?v=p2yLJtGb6LE", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «صرافی در برابر کیف پول». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-1-lesson-6": {
    primary: { title: "اولین خرید امن — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("cC-jh1PJeHw"), sourceUrl: "https://www.youtube.com/watch?v=cC-jh1PJeHw", description: "ویدیوی کوتاه و مرتبط با مبحث «اولین خرید امن» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "اولین خرید امن — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("p2yLJtGb6LE"), sourceUrl: "https://www.youtube.com/watch?v=p2yLJtGb6LE", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «اولین خرید امن». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-1-lesson-7": {
    primary: { title: "مرور ترم و مسیر ادامه — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("41-v10uRlsA"), sourceUrl: "https://www.youtube.com/watch?v=41-v10uRlsA", description: "ویدیوی کوتاه و مرتبط با مبحث «مرور ترم و مسیر ادامه» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "مرور ترم و مسیر ادامه — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("Yb6825iv0Vk"), sourceUrl: "https://www.youtube.com/watch?v=Yb6825iv0Vk", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «مرور ترم و مسیر ادامه». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-2-lesson-1": {
    primary: { title: "زنجیره امنیت حساب — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("d0wW-3l-2ps"), sourceUrl: "https://www.youtube.com/watch?v=d0wW-3l-2ps", description: "ویدیوی کوتاه و مرتبط با مبحث «زنجیره امنیت حساب» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "زنجیره امنیت حساب — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("cC-jh1PJeHw"), sourceUrl: "https://www.youtube.com/watch?v=cC-jh1PJeHw", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «زنجیره امنیت حساب». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-2-lesson-2": {
    primary: { title: "رمز عبور امن — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("3NjQ9b3pgIg"), sourceUrl: "https://www.youtube.com/watch?v=3NjQ9b3pgIg", description: "ویدیوی کوتاه و مرتبط با مبحث «رمز عبور امن» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "رمز عبور امن — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("hGRii5f_uSc"), sourceUrl: "https://www.youtube.com/watch?v=hGRii5f_uSc", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «رمز عبور امن». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-2-lesson-3": {
    primary: { title: "ورود دومرحله‌ای — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("hGRii5f_uSc"), sourceUrl: "https://www.youtube.com/watch?v=hGRii5f_uSc", description: "ویدیوی کوتاه و مرتبط با مبحث «ورود دومرحله‌ای» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "ورود دومرحله‌ای — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("d0wW-3l-2ps"), sourceUrl: "https://www.youtube.com/watch?v=d0wW-3l-2ps", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «ورود دومرحله‌ای». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-2-lesson-4": {
    primary: { title: "فیشینگ و لینک جعلی — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("cC-jh1PJeHw"), sourceUrl: "https://www.youtube.com/watch?v=cC-jh1PJeHw", description: "ویدیوی کوتاه و مرتبط با مبحث «فیشینگ و لینک جعلی» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "فیشینگ و لینک جعلی — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("VYWc9dFqROI"), sourceUrl: "https://www.youtube.com/watch?v=VYWc9dFqROI", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «فیشینگ و لینک جعلی». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-2-lesson-5": {
    primary: { title: "عبارت بازیابی و کیف پول — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("AcrEEnDLm58"), sourceUrl: "https://www.youtube.com/watch?v=AcrEEnDLm58", description: "ویدیوی کوتاه و مرتبط با مبحث «عبارت بازیابی و کیف پول» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "عبارت بازیابی و کیف پول — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("SQyg9pyJ1Ac"), sourceUrl: "https://www.youtube.com/watch?v=SQyg9pyJ1Ac", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «عبارت بازیابی و کیف پول». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-2-lesson-6": {
    primary: { title: "امنیت مرورگر و دستگاه — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("k6UfA6t0Z4E"), sourceUrl: "https://www.youtube.com/watch?v=k6UfA6t0Z4E", description: "ویدیوی کوتاه و مرتبط با مبحث «امنیت مرورگر و دستگاه» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "امنیت مرورگر و دستگاه — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("JvK6oVbq2y4"), sourceUrl: "https://www.youtube.com/watch?v=JvK6oVbq2y4", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «امنیت مرورگر و دستگاه». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-2-lesson-7": {
    primary: { title: "واکنش به هک و بحران — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("d0wW-3l-2ps"), sourceUrl: "https://www.youtube.com/watch?v=d0wW-3l-2ps", description: "ویدیوی کوتاه و مرتبط با مبحث «واکنش به هک و بحران» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "واکنش به هک و بحران — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("cC-jh1PJeHw"), sourceUrl: "https://www.youtube.com/watch?v=cC-jh1PJeHw", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «واکنش به هک و بحران». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-3-lesson-1": {
    primary: { title: "کار صرافی و بازار اسپات — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("p2yLJtGb6LE"), sourceUrl: "https://www.youtube.com/watch?v=p2yLJtGb6LE", description: "ویدیوی کوتاه و مرتبط با مبحث «کار صرافی و بازار اسپات» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "کار صرافی و بازار اسپات — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("Aq3a-_O2NcI"), sourceUrl: "https://www.youtube.com/watch?v=Aq3a-_O2NcI", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «کار صرافی و بازار اسپات». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-3-lesson-2": {
    primary: { title: "تفاوت اسپات و اهرم — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("p2yLJtGb6LE"), sourceUrl: "https://www.youtube.com/watch?v=p2yLJtGb6LE", description: "ویدیوی کوتاه و مرتبط با مبحث «تفاوت اسپات و اهرم» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "تفاوت اسپات و اهرم — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("4c1kAYhS4cE"), sourceUrl: "https://www.youtube.com/watch?v=4c1kAYhS4cE", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «تفاوت اسپات و اهرم». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-3-lesson-3": {
    primary: { title: "Market و Limit Order — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("4c1kAYhS4cE"), sourceUrl: "https://www.youtube.com/watch?v=4c1kAYhS4cE", description: "ویدیوی کوتاه و مرتبط با مبحث «Market و Limit Order» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "Market و Limit Order — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("p2yLJtGb6LE"), sourceUrl: "https://www.youtube.com/watch?v=p2yLJtGb6LE", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «Market و Limit Order». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-3-lesson-4": {
    primary: { title: "کارمزد، اسپرد و نقدشوندگی — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("h7CN5Tj9wVk"), sourceUrl: "https://www.youtube.com/watch?v=h7CN5Tj9wVk", description: "ویدیوی کوتاه و مرتبط با مبحث «کارمزد، اسپرد و نقدشوندگی» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "کارمزد، اسپرد و نقدشوندگی — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("Yb6825iv0Vk"), sourceUrl: "https://www.youtube.com/watch?v=Yb6825iv0Vk", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «کارمزد، اسپرد و نقدشوندگی». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-3-lesson-5": {
    primary: { title: "برداشت و انتخاب شبکه — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("AeEMIh7bNPY"), sourceUrl: "https://www.youtube.com/watch?v=AeEMIh7bNPY", description: "ویدیوی کوتاه و مرتبط با مبحث «برداشت و انتخاب شبکه» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "برداشت و انتخاب شبکه — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("k9n4W9wV5DM"), sourceUrl: "https://www.youtube.com/watch?v=k9n4W9wV5DM", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «برداشت و انتخاب شبکه». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-3-lesson-6": {
    primary: { title: "ژورنال معامله — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("KQp2N57F2eI"), sourceUrl: "https://www.youtube.com/watch?v=KQp2N57F2eI", description: "ویدیوی کوتاه و مرتبط با مبحث «ژورنال معامله» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "ژورنال معامله — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("mQvw5JXXnrQ"), sourceUrl: "https://www.youtube.com/watch?v=mQvw5JXXnrQ", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «ژورنال معامله». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-3-lesson-7": {
    primary: { title: "اولین معامله امن — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("p2yLJtGb6LE"), sourceUrl: "https://www.youtube.com/watch?v=p2yLJtGb6LE", description: "ویدیوی کوتاه و مرتبط با مبحث «اولین معامله امن» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "اولین معامله امن — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Beginner", language: "English / optional learning", ...yt("1pG3pdjFGzU"), sourceUrl: "https://www.youtube.com/watch?v=1pG3pdjFGzU", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «اولین معامله امن». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-4-lesson-1": {
    primary: { title: "نمودار قیمت و رفتار بازار — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("8-x2S8owxYQ"), sourceUrl: "https://www.youtube.com/watch?v=8-x2S8owxYQ", description: "ویدیوی کوتاه و مرتبط با مبحث «نمودار قیمت و رفتار بازار» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "نمودار قیمت و رفتار بازار — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("jmoOrgTP5XQ"), sourceUrl: "https://www.youtube.com/watch?v=jmoOrgTP5XQ", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «نمودار قیمت و رفتار بازار». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-4-lesson-2": {
    primary: { title: "کندل‌شناسی — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("8-x2S8owxYQ"), sourceUrl: "https://www.youtube.com/watch?v=8-x2S8owxYQ", description: "ویدیوی کوتاه و مرتبط با مبحث «کندل‌شناسی» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "کندل‌شناسی — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("jmoOrgTP5XQ"), sourceUrl: "https://www.youtube.com/watch?v=jmoOrgTP5XQ", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «کندل‌شناسی». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-4-lesson-3": {
    primary: { title: "تایم‌فریم و روند — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("rlZRtQkfK04"), sourceUrl: "https://www.youtube.com/watch?v=rlZRtQkfK04", description: "ویدیوی کوتاه و مرتبط با مبحث «تایم‌فریم و روند» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "تایم‌فریم و روند — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("eynxyoKgpng"), sourceUrl: "https://www.youtube.com/watch?v=eynxyoKgpng", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «تایم‌فریم و روند». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-4-lesson-4": {
    primary: { title: "حمایت و مقاومت — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("noRGPnpw4NA"), sourceUrl: "https://www.youtube.com/watch?v=noRGPnpw4NA", description: "ویدیوی کوتاه و مرتبط با مبحث «حمایت و مقاومت» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "حمایت و مقاومت — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("0N4gNA5z4xQ"), sourceUrl: "https://www.youtube.com/watch?v=0N4gNA5z4xQ", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «حمایت و مقاومت». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-4-lesson-5": {
    primary: { title: "حجم معاملات — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("o5XhSgW7aQ8"), sourceUrl: "https://www.youtube.com/watch?v=o5XhSgW7aQ8", description: "ویدیوی کوتاه و مرتبط با مبحث «حجم معاملات» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "حجم معاملات — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("Yb6825iv0Vk"), sourceUrl: "https://www.youtube.com/watch?v=Yb6825iv0Vk", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «حجم معاملات». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-4-lesson-6": {
    primary: { title: "RSI و MACD — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("y4YkXKkBZtM"), sourceUrl: "https://www.youtube.com/watch?v=y4YkXKkBZtM", description: "ویدیوی کوتاه و مرتبط با مبحث «RSI و MACD» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "RSI و MACD — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("yA1cQy-nm5A"), sourceUrl: "https://www.youtube.com/watch?v=yA1cQy-nm5A", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «RSI و MACD». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-4-lesson-7": {
    primary: { title: "ساخت سناریوی تحلیلی — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Beginner", language: "English / learning reference", ...yt("0N4gNA5z4xQ"), sourceUrl: "https://www.youtube.com/watch?v=0N4gNA5z4xQ", description: "ویدیوی کوتاه و مرتبط با مبحث «ساخت سناریوی تحلیلی» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "ساخت سناریوی تحلیلی — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("noRGPnpw4NA"), sourceUrl: "https://www.youtube.com/watch?v=noRGPnpw4NA", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «ساخت سناریوی تحلیلی». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-5-lesson-1": {
    primary: { title: "فاندامنتال چیست — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("6S8qytwWjag"), sourceUrl: "https://www.youtube.com/watch?v=6S8qytwWjag", description: "ویدیوی کوتاه و مرتبط با مبحث «فاندامنتال چیست» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "فاندامنتال چیست — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("mQvw5JXXnrQ"), sourceUrl: "https://www.youtube.com/watch?v=mQvw5JXXnrQ", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «فاندامنتال چیست». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-5-lesson-2": {
    primary: { title: "خواندن وایت‌پیپر — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("Lk2Z57GmOHw"), sourceUrl: "https://www.youtube.com/watch?v=Lk2Z57GmOHw", description: "ویدیوی کوتاه و مرتبط با مبحث «خواندن وایت‌پیپر» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "خواندن وایت‌پیپر — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("mQvw5JXXnrQ"), sourceUrl: "https://www.youtube.com/watch?v=mQvw5JXXnrQ", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «خواندن وایت‌پیپر». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-5-lesson-3": {
    primary: { title: "تیم، نقشه راه و جامعه — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("mQvw5JXXnrQ"), sourceUrl: "https://www.youtube.com/watch?v=mQvw5JXXnrQ", description: "ویدیوی کوتاه و مرتبط با مبحث «تیم، نقشه راه و جامعه» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "تیم، نقشه راه و جامعه — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("6S8qytwWjag"), sourceUrl: "https://www.youtube.com/watch?v=6S8qytwWjag", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «تیم، نقشه راه و جامعه». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-5-lesson-4": {
    primary: { title: "توکنومیکس و عرضه — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("xQF2Yv6uQpM"), sourceUrl: "https://www.youtube.com/watch?v=xQF2Yv6uQpM", description: "ویدیوی کوتاه و مرتبط با مبحث «توکنومیکس و عرضه» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "توکنومیکس و عرضه — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("ftCaqG7wckg"), sourceUrl: "https://www.youtube.com/watch?v=ftCaqG7wckg", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «توکنومیکس و عرضه». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-5-lesson-5": {
    primary: { title: "Market Cap و Volume — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("6S8qytwWjag"), sourceUrl: "https://www.youtube.com/watch?v=6S8qytwWjag", description: "ویدیوی کوتاه و مرتبط با مبحث «Market Cap و Volume» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "Market Cap و Volume — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("Yb6825iv0Vk"), sourceUrl: "https://www.youtube.com/watch?v=Yb6825iv0Vk", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «Market Cap و Volume». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-5-lesson-6": {
    primary: { title: "اقتصاد کلان و کریپتو — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("1pG3pdjFGzU"), sourceUrl: "https://www.youtube.com/watch?v=1pG3pdjFGzU", description: "ویدیوی کوتاه و مرتبط با مبحث «اقتصاد کلان و کریپتو» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "اقتصاد کلان و کریپتو — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("6S8qytwWjag"), sourceUrl: "https://www.youtube.com/watch?v=6S8qytwWjag", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «اقتصاد کلان و کریپتو». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-5-lesson-7": {
    primary: { title: "ردفلگ‌های پروژه — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("cC-jh1PJeHw"), sourceUrl: "https://www.youtube.com/watch?v=cC-jh1PJeHw", description: "ویدیوی کوتاه و مرتبط با مبحث «ردفلگ‌های پروژه» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "ردفلگ‌های پروژه — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("mQvw5JXXnrQ"), sourceUrl: "https://www.youtube.com/watch?v=mQvw5JXXnrQ", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «ردفلگ‌های پروژه». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-6-lesson-1": {
    primary: { title: "مدیریت ریسک — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("1pG3pdjFGzU"), sourceUrl: "https://www.youtube.com/watch?v=1pG3pdjFGzU", description: "ویدیوی کوتاه و مرتبط با مبحث «مدیریت ریسک» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "مدیریت ریسک — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("p2yLJtGb6LE"), sourceUrl: "https://www.youtube.com/watch?v=p2yLJtGb6LE", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «مدیریت ریسک». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-6-lesson-2": {
    primary: { title: "درصد ریسک در معامله — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("kF7k4nG6O8I"), sourceUrl: "https://www.youtube.com/watch?v=kF7k4nG6O8I", description: "ویدیوی کوتاه و مرتبط با مبحث «درصد ریسک در معامله» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "درصد ریسک در معامله — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("1pG3pdjFGzU"), sourceUrl: "https://www.youtube.com/watch?v=1pG3pdjFGzU", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «درصد ریسک در معامله». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-6-lesson-3": {
    primary: { title: "حد ضرر — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("nQJg4fH9Tqg"), sourceUrl: "https://www.youtube.com/watch?v=nQJg4fH9Tqg", description: "ویدیوی کوتاه و مرتبط با مبحث «حد ضرر» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "حد ضرر — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("vlGgF0Q2hfw"), sourceUrl: "https://www.youtube.com/watch?v=vlGgF0Q2hfw", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «حد ضرر». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-6-lesson-4": {
    primary: { title: "اندازه موقعیت — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("kF7k4nG6O8I"), sourceUrl: "https://www.youtube.com/watch?v=kF7k4nG6O8I", description: "ویدیوی کوتاه و مرتبط با مبحث «اندازه موقعیت» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "اندازه موقعیت — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("1pG3pdjFGzU"), sourceUrl: "https://www.youtube.com/watch?v=1pG3pdjFGzU", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «اندازه موقعیت». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-6-lesson-5": {
    primary: { title: "FOMO و ترس از جا ماندن — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("dD_jq8vWJf4"), sourceUrl: "https://www.youtube.com/watch?v=dD_jq8vWJf4", description: "ویدیوی کوتاه و مرتبط با مبحث «FOMO و ترس از جا ماندن» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "FOMO و ترس از جا ماندن — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("5eW6Eagr9XA"), sourceUrl: "https://www.youtube.com/watch?v=5eW6Eagr9XA", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «FOMO و ترس از جا ماندن». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-6-lesson-6": {
    primary: { title: "انتقام از بازار — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("5eW6Eagr9XA"), sourceUrl: "https://www.youtube.com/watch?v=5eW6Eagr9XA", description: "ویدیوی کوتاه و مرتبط با مبحث «انتقام از بازار» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "انتقام از بازار — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("dD_jq8vWJf4"), sourceUrl: "https://www.youtube.com/watch?v=dD_jq8vWJf4", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «انتقام از بازار». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-6-lesson-7": {
    primary: { title: "ژورنال و مرور عملکرد — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("KQp2N57F2eI"), sourceUrl: "https://www.youtube.com/watch?v=KQp2N57F2eI", description: "ویدیوی کوتاه و مرتبط با مبحث «ژورنال و مرور عملکرد» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "ژورنال و مرور عملکرد — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("mQvw5JXXnrQ"), sourceUrl: "https://www.youtube.com/watch?v=mQvw5JXXnrQ", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «ژورنال و مرور عملکرد». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-7-lesson-1": {
    primary: { title: "سنجش یادگیری — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("KQp2N57F2eI"), sourceUrl: "https://www.youtube.com/watch?v=KQp2N57F2eI", description: "ویدیوی کوتاه و مرتبط با مبحث «سنجش یادگیری» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "سنجش یادگیری — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("1pG3pdjFGzU"), sourceUrl: "https://www.youtube.com/watch?v=1pG3pdjFGzU", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «سنجش یادگیری». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-7-lesson-2": {
    primary: { title: "رفع ضعف‌ها — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("1pG3pdjFGzU"), sourceUrl: "https://www.youtube.com/watch?v=1pG3pdjFGzU", description: "ویدیوی کوتاه و مرتبط با مبحث «رفع ضعف‌ها» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "رفع ضعف‌ها — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("KQp2N57F2eI"), sourceUrl: "https://www.youtube.com/watch?v=KQp2N57F2eI", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «رفع ضعف‌ها». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-7-lesson-3": {
    primary: { title: "انتخاب مسیر تخصصی — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("n0JjFj7tY7A"), sourceUrl: "https://www.youtube.com/watch?v=n0JjFj7tY7A", description: "ویدیوی کوتاه و مرتبط با مبحث «انتخاب مسیر تخصصی» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "انتخاب مسیر تخصصی — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("KQp2N57F2eI"), sourceUrl: "https://www.youtube.com/watch?v=KQp2N57F2eI", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «انتخاب مسیر تخصصی». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-7-lesson-4": {
    primary: { title: "مسیر رایگان و دوره رسمی — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("41-v10uRlsA"), sourceUrl: "https://www.youtube.com/watch?v=41-v10uRlsA", description: "ویدیوی کوتاه و مرتبط با مبحث «مسیر رایگان و دوره رسمی» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "مسیر رایگان و دوره رسمی — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("6S8qytwWjag"), sourceUrl: "https://www.youtube.com/watch?v=6S8qytwWjag", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «مسیر رایگان و دوره رسمی». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-7-lesson-5": {
    primary: { title: "آمادگی ورود جدی — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("1pG3pdjFGzU"), sourceUrl: "https://www.youtube.com/watch?v=1pG3pdjFGzU", description: "ویدیوی کوتاه و مرتبط با مبحث «آمادگی ورود جدی» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "آمادگی ورود جدی — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("dD_jq8vWJf4"), sourceUrl: "https://www.youtube.com/watch?v=dD_jq8vWJf4", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «آمادگی ورود جدی». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  },
  "term-7-lesson-6": {
    primary: { title: "قدم بعدی مسئولانه — ویدیوی کوتاه", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "5-10 min", level: "Intermediate", language: "English / learning reference", ...yt("cC-jh1PJeHw"), sourceUrl: "https://www.youtube.com/watch?v=cC-jh1PJeHw", description: "ویدیوی کوتاه و مرتبط با مبحث «قدم بعدی مسئولانه» برای فهم سریع مفهوم و تقویت یادگیری همین درس." },
    secondary: { title: "قدم بعدی مسئولانه — آموزش تکمیلی", provider: "منبع آموزشی معتبر منتخب تک‌پی", teacher: "منتخب آکادمی تک‌پی", duration: "12-30 min", level: "Intermediate", language: "English / optional learning", ...yt("41-v10uRlsA"), sourceUrl: "https://www.youtube.com/watch?v=41-v10uRlsA", description: "ویدیوی تکمیلی برای عمق بیشتر در مبحث «قدم بعدی مسئولانه». این ویدیو اختیاری است و جایگزین متن فارسی درس نیست." },
  }
};

const FALLBACK_VIDEO_PAIR = ACADEMY_VIDEO_LIBRARY["term-1-lesson-1"];

function videoPairFor(slug: string, lessonIndex: number) {
  return ACADEMY_VIDEO_LIBRARY[`term-${termNumberFromSlug(slug)}-lesson-${lessonIndex + 1}`] ?? FALLBACK_VIDEO_PAIR;
}

function videoCard(video: AcademyVideo, role: "primary" | "secondary", isFa: boolean, onOpen: (video: AcademyVideo) => void) {
  return (
    <article className="overflow-hidden rounded-3xl border border-cyan-300/20 bg-cyan-500/10 shadow-sm">
      <button type="button" onClick={() => onOpen(video)} className="group relative block aspect-video w-full overflow-hidden bg-slate-950 text-right">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={video.thumbnailUrl} alt={video.title} className="h-full w-full object-cover opacity-90 transition duration-300 group-hover:scale-105 group-hover:opacity-100" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-slate-950 shadow-xl transition group-hover:scale-110"><PlayCircle className="h-8 w-8" /></span></div>
        <div className="absolute bottom-3 right-3 left-3">
          <p className="text-[11px] font-black text-cyan-200">{role === "primary" ? (isFa ? "ویدیوی کوتاه" : "Quick video") : isFa ? "ویدیوی تکمیلی" : "Deep-dive video"}</p>
          <h4 className="mt-1 line-clamp-2 text-sm font-black leading-6 text-white">{video.title}</h4>
        </div>
      </button>
      <div className="space-y-3 p-4">
        <p className="text-xs font-bold leading-6 text-slate-600 dark:text-slate-300">{video.description}</p>
        <div className="flex flex-wrap gap-2 text-[11px] font-black text-slate-600 dark:text-slate-300">
          <span className="rounded-full bg-white/70 px-2 py-1 dark:bg-white/10">{video.provider}</span>
          <span className="rounded-full bg-white/70 px-2 py-1 dark:bg-white/10">{video.duration}</span>
          <span className="rounded-full bg-white/70 px-2 py-1 dark:bg-white/10">{video.level}</span>
          <span className="rounded-full bg-white/70 px-2 py-1 dark:bg-white/10">{video.language}</span>
        </div>
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{isFa ? "مدرس/کانال:" : "Teacher/channel:"} {video.teacher}</p>
        <button onClick={() => onOpen(video)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black text-white dark:bg-white dark:text-slate-950"><PlayCircle className="h-4 w-4" /> {isFa ? "پخش داخل آکادمی" : "Play inside academy"}</button>
        <a href={video.sourceUrl} target="_blank" rel="noreferrer" className="block text-center text-[11px] font-black text-cyan-600 dark:text-cyan-300">{isFa ? "منبع ویدیو" : "Video source"}: {video.provider}</a>
      </div>
    </article>
  );
}

function stableShuffle<T>(items: T[], seedText: string) {
  const arr = [...items];
  let seed = 0;
  for (let i = 0; i < seedText.length; i += 1) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type LessonPracticeQuestion = { q: string; options: string[] };

function genericLessonOptions(isFa: boolean, heading: string) {
  return isFa
    ? [
        `می‌توانم مفهوم «${heading}» را با مثال ساده توضیح بدهم`,
        "فقط عنوان درس را خوانده‌ام",
        "بدون تمرین می‌توانم تصمیم مالی بگیرم",
        "این موضوع ربطی به ریسک ندارد",
      ]
    : [
        `I can explain “${heading}” with a simple example`,
        "I only read the lesson title",
        "I can make financial decisions without practice",
        "This topic is unrelated to risk",
      ];
}

function termNumberFromSlug(slug: string) {
  const match = slug.match(/term-(\d+)/);
  return match ? Number(match[1]) : 1;
}

function questionFor(slug: string, lessonIndex: number, section: Section, locale: "fa" | "en"): LessonPracticeQuestion {
  const isFa = locale === "fa";
  return {
    q: isFa ? `بعد از این درس درباره «${section.heading}» کدام وضعیت برای تو درست‌تر است؟` : `After this lesson on “${section.heading}”, which state best describes you?`,
    options: stableShuffle(genericLessonOptions(isFa, section.heading), `${locale}-${slug}-${lessonIndex}-${section.heading}`),
  };
}

function cleanParagraphs(body: readonly string[]) {
  return body.filter((paragraph) => {
    const p = paragraph.trim();
    return !p.startsWith("تمرین کوتاه:") && !p.startsWith("سناریوی واقعی:") && !p.startsWith("نکته رفتاری:") && !p.startsWith("Short exercise:") && !p.startsWith("Real scenario:") && !p.startsWith("Behavioral note:");
  });
}

type LessonMasterUpgrade = {
  story: string;
  practicalExample: string;
  commonMistake: string;
  exercise: string;
  scenario: string;
  takeaway: string;
};

const TERM_UPGRADE_FA: Record<number, Omit<LessonMasterUpgrade, "story">> = {
  1: {
    practicalExample: "یک کاربر تازه‌کار قبل از خرید حتی ۱۰ دلار، باید بتواند توضیح دهد پول، تورم، بیت‌کوین، بلاکچین، کیف پول و صرافی چه فرقی با هم دارند.",
    commonMistake: "اشتباه رایج این است که کاربر اول خرید می‌کند و بعد تازه دنبال فهمیدن شبکه انتقال، کارمزد، کیف پول و ریسک نگهداری می‌رود.",
    exercise: "در صفحه رمزارز BTC یا USDT، قیمت، حجم ۲۴ ساعته، Market Cap و Max Supply را پیدا کنید و در یک جمله بنویسید هرکدام چه چیزی درباره ریسک یا ارزش دارایی می‌گوید.",
    scenario: "فرض کنید ۱۰۰ دلار برای یادگیری دارید. ۹۰ دلار خرید هیجانی و بدون برنامه خطرناک است؛ اما ۱۰ دلار خرید آزمایشی همراه با یادداشت دلیل خرید و بررسی کارمزد، یک تمرین آموزشی امن‌تر است.",
    takeaway: "هدف ترم ۱ این است که کاربر قبل از معامله، زبان بازار را بفهمد و با ترس، تبلیغ یا عجله تصمیم نگیرد."
  },
  2: {
    practicalExample: "اگر کاربر عبارت بازیابی را در گالری ذخیره کند، داشتن رمز قوی یا 2FA هم نمی‌تواند جلوی خالی‌شدن کیف پول را بگیرد.",
    commonMistake: "اشتباه رایج این است که امنیت را فقط رمز عبور بدانیم؛ در حالی که لینک جعلی، افزونه مرورگر، سیم‌کارت، موبایل آلوده و Seed Phrase هم حلقه‌های امنیت هستند.",
    exercise: "امروز سه چیز را بررسی کنید: آیا رمز ایمیل و صرافی یکتا است؟ آیا 2FA اپلیکیشنی فعال است؟ آیا عبارت بازیابی هیچ‌جا آنلاین ذخیره نشده؟",
    scenario: "پیامی می‌آید: «حساب شما مسدود می‌شود، فوری وارد شوید». کاربر حرفه‌ای روی لینک نمی‌زند؛ آدرس رسمی را خودش تایپ می‌کند و از داخل پنل وضعیت را بررسی می‌کند.",
    takeaway: "هدف ترم ۲ این است که کاربر سرمایه را قبل از سود حفظ کند؛ چون در کریپتو یک اشتباه امنیتی می‌تواند برگشت‌ناپذیر باشد."
  },
  3: {
    practicalExample: "در خرید Market، اگر بازار عمق کافی نداشته باشد، قیمت نهایی می‌تواند از چیزی که دیده‌اید بدتر شود؛ این همان Slippage است.",
    commonMistake: "اشتباه رایج این است که کاربر فقط دکمه خرید را ببیند و دفتر سفارش، کارمزد، اسپرد، شبکه برداشت و نقدشوندگی را نادیده بگیرد.",
    exercise: "برای یک جفت‌ارز، قیمت خرید، قیمت فروش، اسپرد، حجم ۲۴ ساعته و کارمزد را پیدا کنید و قیمت سربه‌سر معامله را حساب کنید.",
    scenario: "اگر ۱۰۰ دلار USDT دارید و می‌خواهید BTC بخرید، سفارش Limit برای قیمت مشخص مناسب‌تر است؛ اما اگر عجله دارید، Market سریع‌تر اجرا می‌شود ولی ممکن است قیمت بدتری بدهد.",
    takeaway: "هدف ترم ۳ این است که کاربر صرافی را فقط دکمه خرید و فروش نبیند؛ بلکه مکانیزم معامله، هزینه و خطای انتقال را بفهمد."
  },
  4: {
    practicalExample: "یک کندل سبز بزرگ زیر مقاومت همیشه فرصت خرید نیست؛ اگر حجم ضعیف باشد یا سایه بالا بلند باشد، ممکن است فشار فروش پنهان وجود داشته باشد.",
    commonMistake: "اشتباه رایج این است که کاربر با یک اندیکاتور مثل RSI یا MACD تصمیم قطعی بگیرد و روند، حجم، تایم‌فریم و نقطه ابطال را نبیند.",
    exercise: "روی نمودار BTC سه ناحیه مشخص کنید: حمایت، مقاومت و نقطه‌ای که اگر قیمت به آن برسد تحلیل شما باطل می‌شود.",
    scenario: "قیمت به مقاومت می‌رسد، RSI بالا است، حجم کاهش یافته و کندل سایه بالایی دارد. سناریوی حرفه‌ای یعنی قبل از ورود، هم مسیر صعودی و هم مسیر شکست‌خورده را نوشته باشید.",
    takeaway: "هدف ترم ۴ پیش‌بینی قطعی نیست؛ هدف ساخت سناریو و تصمیم‌گیری منظم در شرایط عدم قطعیت است."
  },
  5: {
    practicalExample: "پروژه‌ای با Market Cap پایین ولی FDV بسیار بالا ممکن است در آینده با آزادسازی توکن‌ها فشار فروش سنگین تجربه کند.",
    commonMistake: "اشتباه رایج این است که کاربر فقط قیمت واحد توکن را ببیند؛ ارزان‌بودن قیمت به معنی ارزنده‌بودن پروژه نیست.",
    exercise: "برای یک رمزارز، Website، Whitepaper، Tokenomics، Market Cap، FDV، Volume و برنامه عرضه را بررسی کنید و بنویسید بزرگ‌ترین ریسک پروژه چیست.",
    scenario: "پروژه A مارکت‌کپ ۲۰۰ میلیون و FDV ده میلیارد دارد؛ پروژه B مارکت‌کپ ۳ میلیارد و FDV ۳.۵ میلیارد. پروژه A شاید جذاب‌تر به نظر برسد اما ریسک Unlock بالاتری دارد.",
    takeaway: "هدف ترم ۵ این است که کاربر پروژه را مثل یک تحلیلگر بررسی کند، نه مثل کسی که فقط دنبال پامپ بعدی است."
  },
  6: {
    practicalExample: "اگر در هر معامله ۱۰٪ سرمایه را ریسک کنید، چند ضرر پشت‌سرهم می‌تواند حساب و آرامش ذهنی شما را نابود کند.",
    commonMistake: "اشتباه رایج این است که کاربر اول به سود فکر کند و بعد به ریسک؛ معامله‌گر حرفه‌ای اول می‌پرسد اگر اشتباه کنم چقدر ضرر می‌کنم؟",
    exercise: "برای سرمایه ۱۰۰۰ دلار، اگر ریسک مجاز هر معامله ۱٪ باشد و حد ضرر ۵٪ فاصله داشته باشد، حجم موقعیت مجاز را محاسبه کنید.",
    scenario: "تحلیل شما درست است اما حجم معامله آن‌قدر بزرگ است که با یک نوسان کوچک از ترس خارج می‌شوید. این یعنی مشکل تحلیل نیست؛ مشکل Position Size است.",
    takeaway: "هدف ترم ۶ بقا است. بدون بقا، هیچ استراتژی و هیچ تحلیل خوبی فرصت نتیجه‌دادن ندارد."
  },
  7: {
    practicalExample: "کاربری که ژورنال دارد بعد از ۲۰ معامله می‌فهمد بیشتر ضررهایش از FOMO بوده، نه از بلد نبودن تحلیل.",
    commonMistake: "اشتباه رایج این است که کاربر بعد از یک سود فکر کند آماده بازار حرفه‌ای است؛ آمادگی یعنی امنیت، تحلیل، ریسک و روانشناسی هم‌زمان اجرا شوند.",
    exercise: "سه ضعف اصلی خود را بنویسید: امنیت، تحلیل، مدیریت سرمایه یا احساسات. برای هرکدام یک تمرین هفتگی تعریف کنید.",
    scenario: "بعد از یک ضرر، وسوسه می‌شوید معامله بعدی را دو برابر کنید. تصمیم حرفه‌ای این است که توقف کنید، ژورنال را بخوانید و فقط طبق پلن وارد شوید.",
    takeaway: "هدف ترم ۷ تبدیل دانش به رفتار است؛ یعنی کاربر بتواند در فشار واقعی بازار هم از برنامه‌اش خارج نشود."
  }
};

function lessonMasterUpgrade(slug: string, section: Section, lessonIndex: number, isFa: boolean): LessonMasterUpgrade {
  const term = termNumberFromSlug(slug);
  const base = TERM_UPGRADE_FA[term] ?? TERM_UPGRADE_FA[1];
  const heading = section.heading;
  if (!isFa) {
    return {
      story: `Imagine a beginner facing “${heading}” for the first time. The goal is not memorizing terms; the goal is making one safer real-world decision.`,
      practicalExample: "Open the related market or coin page, identify the live numbers and explain what each number changes in your decision.",
      commonMistake: "The common mistake is acting from hype before checking security, fees, liquidity, risk and invalidation.",
      exercise: "Write one sentence for: what I know, what I do not know, what can go wrong, and what I will do if I am wrong.",
      scenario: "Compare two choices: a fast emotional action versus a small controlled test with a written plan. The second path is the professional path.",
      takeaway: "The goal is practical understanding, not memorization."
    };
  }
  return {
    story: `فرض کن امروز برای اولین بار با مبحث «${heading}» روبه‌رو شده‌ای. هدف این درس حفظ‌کردن چند اصطلاح نیست؛ هدف این است که بتوانی در یک موقعیت واقعی بازار تصمیم امن‌تر و منطقی‌تر بگیری.`,
    ...base,
  };
}

function isLearningSection(section: Section) {
  const h = section.heading.toLowerCase();
  return !h.includes("منابع") && !h.includes("resources") && !h.includes("پایان ترم") && !h.includes("end of term");
}

export function AcademyLessonPlayer({ slug, sections, locale = "fa" }: { slug: string; sections: Section[]; locale?: "fa" | "en" }) {
  const isFa = locale === "fa";
  const learningSections = useMemo(() => sections.filter(isLearningSection), [sections]);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeVideo, setActiveVideo] = useState<AcademyVideo | null>(null);

  const storageKey = `tecpey-lesson-progress-${locale}-${slug}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setCompleted(parsed.completed || {});
        setAnswers(parsed.answers || {});
      }
    } catch {}
  }, [storageKey]);

  const termNo = termNumberFromSlug(slug);
  const completedCount = learningSections.filter((section) => completed[section.heading]).length;
  const reflectionCount = learningSections.filter((section) => Boolean(answers[section.heading])).length;
  const totalSteps = Math.max(1, learningSections.length * 2);
  const progress = Math.round(((completedCount + reflectionCount) / totalSteps) * 100);
  const xp = completedCount * 10 + reflectionCount * 5;
  const termPassed = progress === 100;

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ completed, answers }));
    } catch {}
  }, [storageKey, completed, answers]);

  useEffect(() => {
    try {
      const payload = {
        percent: progress,
        passed: termPassed,
        completedLessons: completedCount,
        reflectionAnswers: reflectionCount,
        totalLessons: learningSections.length,
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(`tecpey-academy-reading-term-${termNo}`, JSON.stringify(payload));
      window.dispatchEvent(new Event("tecpey-academy-progress-updated"));
    } catch {}
  }, [termNo, progress, termPassed, completedCount, reflectionCount, learningSections.length]);

  return (
    <div className="mt-10">
      <div className="sticky top-20 z-20 mb-6 rounded-[28px] border border-cyan-300/20 bg-white/95 p-4 shadow-xl shadow-cyan-500/10 backdrop-blur dark:bg-slate-950/90">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">{isFa ? "مسیر تعاملی یادگیری" : "Interactive learning path"}</p>
            <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">{isFa ? "درس‌ها را مرحله‌ای کامل کنید" : "Complete lessons step by step"}</h2>
          </div>
          <div className="flex gap-2 text-xs font-black">
            <span className="rounded-full bg-cyan-500/10 px-3 py-2 text-cyan-700 dark:text-cyan-200">{progress}%</span>
            <span className="rounded-full bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-200"><Zap className="mr-1 inline h-3 w-3" />{xp} XP</span>
          </div>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div className="h-full rounded-full bg-cyan-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-6">
        {sections.map((section, index) => {
          const isLesson = isLearningSection(section);
          const locked = false;
          const q = questionFor(slug, index, section, locale);
          const selected = answers[section.heading];
          const hasSelected = Boolean(selected);
          const videoPair = videoPairFor(slug, index);
          const master = isLesson ? lessonMasterUpgrade(slug, section, index, isFa) : null;

          return (
            <section key={section.heading} className="rounded-[30px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-cyan-300/10 dark:bg-white/[0.04]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${completed[section.heading] ? "bg-emerald-500 text-white" : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-200"}`}>
                    {completed[section.heading] ? <CheckCircle2 className="h-5 w-5" /> : locked ? <Lock className="h-5 w-5" /> : index + 1}
                  </div>
                  <div>
                    <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">{isLesson ? (isFa ? `درس ${Math.min(index + 1, learningSections.length)}` : `Lesson ${Math.min(index + 1, learningSections.length)}`) : isFa ? "بخش تکمیلی" : "Support section"}</p>
                    <h2 className="mt-1 text-2xl font-black leading-10 text-slate-950 dark:text-white">{section.heading}</h2>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-4">
                  {cleanParagraphs(section.body).map((paragraph) => (
                    <p key={paragraph} className="text-base font-bold leading-9 text-slate-700 dark:text-slate-300">{paragraph}</p>
                  ))}
                  {isLesson && master && (
                    <div className="grid gap-3 pt-2">
                      <div className="rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-4">
                        <p className="text-xs font-black text-cyan-700 dark:text-cyan-200">{isFa ? "داستان شروع" : "Learning story"}</p>
                        <p className="mt-2 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">{master.story}</p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {[
                          [isFa ? "مثال واقعی" : "Real example", master.practicalExample],
                          [isFa ? "اشتباه رایج" : "Common mistake", master.commonMistake],
                          [isFa ? "تمرین عملی" : "Practical exercise", master.exercise],
                          [isFa ? "سناریوی بازار" : "Market scenario", master.scenario],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-3xl border border-cyan-300/15 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                            <p className="text-xs font-black text-cyan-700 dark:text-cyan-200">{label}</p>
                            <p className="mt-2 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">{value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-3xl border border-violet-300/20 bg-violet-500/10 p-4">
                        <p className="text-xs font-black text-violet-700 dark:text-violet-200">{isFa ? "خروجی این درس" : "Lesson outcome"}</p>
                        <p className="mt-2 text-sm font-bold leading-8 text-slate-700 dark:text-slate-300">{master.takeaway}</p>
                      </div>
                    </div>
                  )}
                  {isLesson && (
                    <div className="pt-4 text-center">
                      <button
                        type="button"
                        onClick={() => setCompleted((prev) => ({ ...prev, [section.heading]: true }))}
                        className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-6 py-3 text-xs font-black text-white shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400"
                      >
                        {completed[section.heading] ? (isFa ? "این درس کامل شد" : "Lesson completed") : isFa ? "درس را کامل کردم +10XP" : "Mark lesson complete +10XP"}
                      </button>
                    </div>
                  )}
                </div>

                {isLesson && (
                  <aside className="space-y-4">
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-4">
                        <div className="flex items-center gap-2">
                          <PlayCircle className="h-5 w-5 text-cyan-500" />
                          <h3 className="text-sm font-black text-slate-950 dark:text-white">{isFa ? "ویدیوهای معتبر این درس" : "Curated videos for this lesson"}</h3>
                        </div>
                        <p className="mt-2 text-xs font-bold leading-6 text-slate-600 dark:text-slate-300">
                          {isFa ? "ویدیوها اختیاری هستند و برای تکمیل یادگیری و ساخت ویدیوی اختصاصی فارسی تک‌پی انتخاب شده‌اند. متن فارسی درس برای قبولی کافی است." : "Videos are optional references for deeper learning and future TecPey-owned Persian video production."}
                        </p>
                      </div>
                      {videoCard(videoPair.primary, "primary", isFa, setActiveVideo)}
                      {videoCard(videoPair.secondary, "secondary", isFa, setActiveVideo)}
                    </div>

                    <div className="rounded-3xl border border-amber-300/20 bg-amber-500/10 p-4">
                      <h3 className="text-sm font-black text-slate-950 dark:text-white">{isFa ? "سؤال سریع" : "Quick check"}</h3>
                      <p className="mt-2 text-xs font-bold leading-6 text-slate-700 dark:text-slate-300">{q.q}</p>
                      <div className="mt-3 grid gap-2">
                        {q.options.map((option) => {
                          const chosen = selected === option;
                          let cls = "border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200";
                          if (chosen) cls = "border-cyan-400 bg-cyan-50 text-cyan-800 dark:bg-cyan-400/15 dark:text-cyan-100";
                          return (
                            <button key={option} type="button" onClick={() => {
                              setAnswers((prev) => ({ ...prev, [section.heading]: option }));
                              setCompleted((prev) => ({ ...prev, [section.heading]: true }));
                            }} className={`rounded-2xl border px-3 py-2 text-right text-xs font-black leading-6 transition ${cls}`}>
                              {option}
                            </button>
                          );
                        })}
                      </div>
                      {hasSelected && <p className="mt-2 text-xs font-black text-slate-600 dark:text-slate-300">{isFa ? "پاسخ شما به‌عنوان خودارزیابی آموزشی ثبت شد." : "Your answer was saved as a learning self-check."}</p>}
                    </div>
                  </aside>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {progress === 100 && (
        <div className="mt-6 rounded-[28px] border border-emerald-300/30 bg-emerald-500/10 p-5 text-center">
          <Trophy className="mx-auto h-8 w-8 text-emerald-500" />
          <h3 className="mt-3 text-xl font-black text-slate-950 dark:text-white">{isFa ? "همه درس‌های این ترم کامل شد" : "All lessons completed"}</h3>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-700 dark:text-slate-300">{isFa ? "حالا آزمون نهایی ترم را بزن تا مسیر بعدی باز شود." : "Now take the final term quiz to unlock the next step."}</p>
        </div>
      )}

      {activeVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-5xl overflow-hidden rounded-[30px] bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-4 dark:border-white/10">
              <div>
                <h3 className="font-black text-slate-950 dark:text-white">{activeVideo.title}</h3>
                <p className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-300">{activeVideo.provider} · {activeVideo.duration} · {activeVideo.level}</p>
              </div>
              <button onClick={() => setActiveVideo(null)} className="rounded-full bg-slate-100 p-2 dark:bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            <div className="aspect-video bg-black">
              <iframe src={activeVideo.embedUrl} title={activeVideo.title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm font-bold text-slate-700 dark:text-slate-300">
              <p>{activeVideo.description}</p>
              <a href={activeVideo.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-xs font-black text-white">
                <Maximize2 className="h-4 w-4" /> {isFa ? "مشاهده منبع اصلی" : "Open original source"}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
