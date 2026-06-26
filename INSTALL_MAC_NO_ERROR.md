# TecPey Mac Install — Registry/Timeout Safe

این نسخه مشکل registry داخلی را از `package-lock.json` حذف کرده است. اگر قبلاً خطای `packages.applied-caas-gateway1.internal.api.openai.org` گرفتی، این دستورات را دقیقاً داخل پوشه پروژه بزن.

## 1) ورود به پوشه پروژه

```bash
cd ~/Desktop/tecpey_user_journey_smart_center_patch
pwd
ls package.json
```

اگر اسم پوشه فرق دارد، وارد همان پوشه‌ای شو که `package.json` داخلش است.

## 2) ریست registry و proxy

```bash
npm config set registry https://registry.npmjs.org/
npm config delete proxy || true
npm config delete https-proxy || true
npm config get registry
```

خروجی باید باشد:

```text
https://registry.npmjs.org/
```

## 3) پاکسازی نصب قبلی

```bash
rm -rf node_modules .next
npm cache clean --force
```

## 4) نصب امن

```bash
npm run ci:safe
```

اگر `npm ci` به خاطر lock خطا داد:

```bash
npm run install:safe
```

## 5) فایل env

```bash
cp .env.example .env.local 2>/dev/null || touch .env.local
nano .env.local
```

حداقل مقدارهای ضروری:

```env
OPENAI_API_KEY=YOUR_OPENAI_KEY
OPENAI_MODEL=gpt-4o-mini
JWT_SECRET=CHANGE_TO_LONG_RANDOM_SECRET
CERTIFICATE_SIGNING_SECRET=CHANGE_TO_LONG_RANDOM_SECRET
TECPEY_ADMIN_TOKEN=CHANGE_TO_LONG_RANDOM_ADMIN_TOKEN
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 6) تست‌ها

```bash
npm run env:check
npm run check
npm run build
npm run dev
```

بعد برو به:

```text
http://localhost:3000
```

## اگر دوباره timeout دیدی

```bash
cat ~/.npmrc
npm config get registry
npm config get proxy
npm config get https-proxy
```

خروجی را برای بررسی بفرست.

## رفع خطای «کلید امنیتی آکادمی تنظیم نشده»
این نسخه یک `.env.local` مخصوص تست لوکال دارد. اگر دوباره این خطا را دیدی، در ریشه پروژه این دستور را بزن:

```bash
cp .env.local.example .env.local
```

بعد سه مقدار زیر را با رشته‌های طولانی پر کن:

```env
TECPEY_ACADEMY_AUTH_SECRET=local_dev_academy_auth_secret_change_before_production_64_chars_2026
TECPEY_SESSION_SECRET=local_dev_session_secret_change_before_production_64_chars_2026
CERTIFICATE_SIGNING_SECRET=local_dev_certificate_secret_change_before_production_64_chars_2026
```

برای Production حتماً این Secretها را عوض کن و مقدارهای local را استفاده نکن.
