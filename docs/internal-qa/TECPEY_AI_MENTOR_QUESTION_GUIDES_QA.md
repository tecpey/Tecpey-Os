# TecPey AI Mentor Question Guides Patch QA

## Fixes
- سؤال‌های پیشنهادی صفحه مربی هوشمند از متن ثابت به لینک‌های قابل کلیک تبدیل شدند.
- برای هر سؤال مهم، صفحه راهنمای اختصاصی ساخته شد: `/academy/ai-guide/[slug]`.
- داخل چت مربی، سؤال‌های پیشنهادی هم دکمه پر کردن کادر سؤال دارند و هم لینک «راهنمای کامل این سؤال».
- دو باکس پایین صفحه مربی که لحن طراح/داخلی داشتند، کاربرمحور شدند:
  - مربی چگونه به تو کمک می‌کند؟
  - حریم خصوصی و امنیت سؤال‌ها
- راهنمای فارسی OpenAI API اضافه شد تا کلید داخل `.env.local` قرار بگیرد، نه `.env.local.example`.
- `.gitignore` برای جلوگیری از commit شدن `.env.local` و `.env.production` سختگیرتر شد.

## Manual Test
1. `npm install`
2. `npm run build`
3. `npm start`
4. Open `/academy/ai-guide`
5. Click suggested questions → dedicated guide page should open.
6. Open mentor chat → suggested question button should fill the textarea.
7. Put API key in `.env.local`, restart server, and test live mentor.
