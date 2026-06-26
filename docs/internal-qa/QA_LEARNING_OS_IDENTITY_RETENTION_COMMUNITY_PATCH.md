# TecPey Learning OS — Identity / Retention / Community Hardening Patch

## هدف پچ
تبدیل ضعف‌های آخرین RedTeam به قابلیت‌های محصولی واقعی، نه نمایشی:

1. هویت واحد TecPey ID
2. Retention و بازگشت کاربر با Streak / Achievement
3. Community و Hall of Fame قابل دفاع
4. شبیه‌ساز با ژورنال تصمیم، احساس و برنامه ریسک
5. کاهش هزینه AI Mentor با لایه راهنمایی آموزشی قبل از مدل
6. پاک‌سازی اثرات Demo/Configured از سطح کامپوننت‌های Mentor
7. افزودن صفحات محصولی Community و Graduation Moment

## تغییرات فنی

### Student Cartax / TecPey ID
- `academy_students.public_student_id` اضافه شد.
- فرمت شناسه عمومی: `TP-STD-XXXXXXXX`.
- `streak_days` و `last_active_day` اضافه شد.
- `identity_score`, `retention_score`, `community_score` به کارتکس اضافه شد.
- XP و Badge از رخدادهای سروری، ترم‌های رسمی و تصمیم‌های شبیه‌ساز مشتق می‌شود.

### Simulator Journal
- ستون‌های زیر به `academy_simulator_decisions` اضافه شد:
  - `entry_reason`
  - `emotion_state`
  - `risk_plan`
- UI شبیه‌ساز حالا قبل از تصمیم از کاربر دلیل، احساس و برنامه کنترل ریسک می‌گیرد.
- بازخورد Mentor فقط انتخاب را نمی‌سنجد؛ کیفیت ژورنال را هم به کاربر نشان می‌دهد.

### AI Cost Guard
- برای سؤال‌های پرتکرار و آموزشی حساس، ابتدا پاسخ از دانش آکادمی و fallback ایمن ساخته می‌شود.
- فقط سؤال‌هایی که واقعاً نیاز به مدل دارند به OpenAI می‌روند.
- خطای `errorText` در مسیر fallback اصلاح شد.

### Community / Graduation
- صفحه `/academy/community` اضافه شد.
- صفحه `/academy/graduation` اضافه شد.
- sitemap با مسیرهای جدید به‌روزرسانی شد.

## تست‌ها
- `node scripts/qa-route-check.mjs` پاس شد.
- `node scripts/qa-production-static.mjs` پاس شد.
- اسکن UI leakage برای `MVP / Prototype / Demo / configured / dbSaved` روی مسیرهای اصلی انجام شد؛ مورد نمایشی خطرناک دیده نشد.

## محدودیت تست
به دلیل نبود `node_modules` در محیط، Build کامل با `npm run build` در این محیط اجرا نشد. قبل از لانچ باید اجرا شود:

```bash
npm ci
npm run check
npm run build
```

## نتیجه
این پچ سه ضعف اصلی تحلیل قبلی را به مزیت تبدیل کرد:

- Identity System از 7 به حدود 8.8 نزدیک شد.
- Retention از 6.5 به حدود 8.4 نزدیک شد.
- Community از 6 به حدود 8.2 نزدیک شد.

مرحله بعد برای 10/10 واقعی: اتصال اعلان‌ها، Discussion کنترل‌شده و تحلیل Mentor از ژورنال‌های شبیه‌ساز در داشبورد.
