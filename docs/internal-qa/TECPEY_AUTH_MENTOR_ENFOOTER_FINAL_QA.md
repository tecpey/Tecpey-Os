# TecPey Header/Auth + Mentor Telegram + EN Footer Patch QA

Source: `suptecpey-final-term1-10x-academy-brand-telegram-patch.zip`

## Fixed
1. Header/CTA signup links now point to:
   - `https://my.tecpey.ir/signup`
2. Login/signin links point to:
   - `https://my.tecpey.ir/signin`
3. Internal `/academy/free` and `/en/academy/free` routes redirect to signup.
4. Mentor support area is Telegram-only.
   - WhatsApp support removed from Mentor where detected.
   - Telegram link: `https://t.me/tecpey`
   - Secure external link attrs enforced.
5. English footer licensing labels were normalized away from Persian-only badge text where detected.

## Files patched
### Auth/links
- .env.example.bak
- src/components/navbar/Navbar.tsx
- src/app/home/enterprise/TecpeyEnterpriseLanding.tsx
- src/app/academy/education-first/page.tsx
- src/app/academy/free/page.tsx
- src/app/en/academy/free/page.tsx

### Mentor
- src/components/academy/AiMentorDemo.tsx
- src/components/academy/AcademyMentorCoachCenter.tsx

### Footer/license text
- src/components/footer/Footer.tsx

## Remaining scan
```json
{
  "academy_free": [
    "ACADEMY_CLICKABLE_UX_CHANGELOG.md"
  ],
  "whatsapp": [
    "TECPEY_MENTOR_SUPPORT_WIDGET_FINAL_QA.md",
    "TECPEY_FINAL_3_PATCH_QA.md",
    "TECPEY_FINAL_AI_MENTOR_MEMORY_STREAMING_QA.md",
    "TECPEY_BRAND_TELEGRAM_SUPPORT_PATCH_QA.md"
  ],
  "legacy_brand": [
    "TECPEY_BRAND_TELEGRAM_SUPPORT_PATCH_QA.md"
  ],
  "persian_license": []
}
```

## Test
```bash
npm install
npm run build
npm start
```

## Manual QA
- EN Header Sign Up -> `https://my.tecpey.ir/signup`
- FA Header ثبت‌نام -> `https://my.tecpey.ir/signup`
- Login -> `https://my.tecpey.ir/signin`
- `/academy/free` redirects to signup.
- Mentor support shows one Telegram logo only.
- EN footer does not show Persian government/association badge titles.
