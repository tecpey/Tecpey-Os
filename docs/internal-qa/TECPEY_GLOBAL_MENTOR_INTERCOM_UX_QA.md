# TecPey Global AI Mentor — Intercom UX Patch QA

## هدف پچ
دکمه «از مربی هوشمند بپرس» باید در همه صفحات کنار کاربر باشد، اما روی CTAهای اصلی، مخصوصاً «ورود به آکادمی رایگان» در موبایل نیفتد.

## تغییرات اعمال‌شده
- دکمه Global AI Mentor در موبایل بالاتر از Bottom CTA قرار گرفت.
- عرض دکمه در موبایل محدود شد تا روی دکمه اصلی فشار نیاورد.
- متن موبایل کوتاه‌تر شد: «از مربی بپرس».
- آیکون و متن دکمه با `truncate` کنترل شدند تا در عرض کوچک نشکنند.
- پنل چت در موبایل بالاتر از Bottom CTA باز می‌شود.
- ارتفاع پنل در موبایل محدودتر شد تا مزاحم مطالعه نشود.
- دسکتاپ بدون تغییر UX اصلی باقی ماند.
- ویجت همچنان Global است و از `src/app/layout.tsx` در همه صفحات mount می‌شود.

## QA Checklist
- Mobile Safe Area: Pass
- CTA overlap with Academy bottom bar: Fixed
- Desktop drawer: Pass
- Cross-page persistence: Preserved
- LocalStorage history: Preserved
- API fallback: Preserved
- FA/EN label support: Pass

## تست پیشنهادی
```bash
npm install
npm run build
npm start
```

صفحات تست:
- `/`
- `/academy`
- `/academy/term-1`
- `/crypto-news`
- `/markets`
- `/en/academy`

در موبایل، دکمه مربی باید بالای Bottom CTA باشد و با کلیک، پنل چت بدون خروج از صفحه باز شود.
