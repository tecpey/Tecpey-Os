# QA — Release Engineering Registry/Lock Fix

## مشکل پیدا شده
در `package-lock.json` آدرس resolved بسیاری از پکیج‌ها به registry داخلی OpenAI اشاره می‌کرد:

`packages.applied-caas-gateway1.internal.api.openai.org`

روی سیستم کاربر این registry قابل دسترسی نیست و باعث `ETIMEDOUT` در `npm install` می‌شود.

## اصلاح انجام‌شده
- تمام `resolved`های داخلی در `package-lock.json` به `https://registry.npmjs.org/` تبدیل شدند.
- `.npmrc` پروژه با registry رسمی npm و timeoutهای منطقی بازنویسی شد.
- اسکریپت‌های امن نصب اضافه شدند:
  - `npm run ci:safe`
  - `npm run install:safe`
  - `npm run npm:registry:fix`
- `.nvmrc` برای Node 22 اضافه شد.
- `engines` در `package.json` ثبت شد.
- راهنمای `INSTALL_MAC_NO_ERROR.md` اضافه شد.

## تست استاتیک
- جستجوی registry داخلی: باید صفر باشد.
- مسیر نصب پیشنهادی: `npm run ci:safe`.
