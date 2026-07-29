# TecPey Home News Below Market Board Patch QA

## هدف پچ
انتقال سکشن Crypto News در صفحه Home فارسی به جایگاه درست UX: بلافاصله بعد از Hero/Market Board Online و قبل از بخش‌های آکادمی، مربی هوشمند و مسیر یادگیری.

## تغییر اعمال‌شده
در فایل:

`src/app/home/enterprise/TecpeyEnterpriseLanding.tsx`

ترتیب سکشن‌ها از حالت قبلی:

1. Hero
2. AI Mentor Spotlight
3. Learning Journey
4. Crypto News

به حالت جدید تغییر کرد:

1. Hero / Market Board Online
2. Crypto News
3. AI Mentor Spotlight
4. Learning Journey

## دلیل UX
کاربر ابتدا قیمت‌ها و وضعیت بازار را می‌بیند، سپس بلافاصله اخبار و تحلیل مرتبط با بازار را مشاهده می‌کند. بعد از آن به آکادمی و مربی هوشمند هدایت می‌شود.

## چک‌لیست QA
- [x] Market Board / Hero بدون تغییر باقی ماند.
- [x] Crypto News بلافاصله بعد از Hero قرار گرفت.
- [x] کامپوننت CryptoNewsCenter حذف یا تخریب نشد.
- [x] ترتیب مسیر یادگیری و AI Mentor بعد از اخبار حفظ شد.
- [x] تغییر فقط جابجایی سکشن است و ریسک TypeScript بسیار پایین است.
- [x] نسخه فارسی Home اصلاح شد.

## تست پیشنهادی روی مک
```bash
npm install
npm run build
npm start
```

سپس صفحه زیر را بررسی کنید:

`http://localhost:3000`

انتظار: بعد از Hero/Market Board، بخش «اخبار مهم بازار / Crypto News» نمایش داده شود.
