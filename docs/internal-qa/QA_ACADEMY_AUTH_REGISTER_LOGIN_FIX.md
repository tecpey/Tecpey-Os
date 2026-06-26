# QA — Academy Auth Register/Login Fix

## هدف پچ
رفع شکست ثبت‌نام/ورود آکادمی و تبدیل مسیر آکادمی به حساب مستقل از حساب صرافی.

## اصلاحات انجام‌شده
- سرویس اختصاصی `/api/academy-auth` اکنون حساب آکادمی را واقعاً می‌سازد/بررسی می‌کند.
- ثبت‌نام و ورود آکادمی از حساب صرافی جدا شد.
- در حالت local/dev، اگر دیتابیس وجود نداشته باشد، حساب‌های آکادمی در `storage/academy-auth.local.json` ذخیره می‌شوند.
- در حالت production، بدون `DATABASE_URL` ثبت‌نام آکادمی فعال نمی‌شود.
- رمز عبور با PBKDF2 ذخیره می‌شود و متن خام ذخیره نمی‌شود.
- username تکراری کنترل می‌شود.
- `AcademyAuthClient` حالا mode درست `signup/login` را به API ارسال می‌کند.
- برای تست local، اگر secret در env ست نشده باشد، dev secret داخلی فقط در حالت غیر production استفاده می‌شود؛ production همچنان secret واقعی می‌خواهد.

## تست‌های انجام‌شده
- `npm install` پاس شد.
- `npm run check` پاس شد؛ خروجی فقط warning داشت و TypeScript error نداشت.
- `npm run build` در sandbox به خاطر timeout محیطی کامل نشد؛ TypeScript و lint stage قبل از آن سالم هستند.

## مسیر تست پیشنهادی
1. `/academy/signup`
2. ساخت حساب آکادمی با ایمیل/رمز/نام نمایشی/username
3. انتقال به `/academy/onboarding`
4. ساخت پروفایل آکادمی
5. انتقال به `/academy/profile`
6. باز شدن Mentor / Smart Center / Trading Arena بعد از فعال شدن پروفایل آکادمی

## Production ENV ضروری
- `TECPEY_ACADEMY_AUTH_SECRET` یا `JWT_SECRET` با حداقل ۲۴ کاراکتر
- `TECPEY_SESSION_SECRET` یا `JWT_SECRET`
- `DATABASE_URL`
