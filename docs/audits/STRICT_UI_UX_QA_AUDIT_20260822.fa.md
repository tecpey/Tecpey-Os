# گزارش سختگیرانه QA و UI/UX تک‌پی - 2026-08-22

## خلاصه اجرایی

این بررسی روی `origin/main@1c2172144f5a5fbe3037a262c67cb9799585c1b2` انجام شد و تغییرات اصلاحی در branch `agent/uiux-qa-hardening-20260822` اعمال شد. نتیجه صریح: پروژه از نظر discipline مهندسی و guardهای محصولی جدی است، اما برای ادعای soft launch کامل هنوز به evidence بیرونی، runtime screenshot matrix و staging proof نیاز دارد.

وضعیت فعلی برای لانچ باید همچنان این باشد: محصول آموزشی کنترل‌شده با Academy، Mentor و Arena مجازی؛ نه GO برای real-money Exchange، custody، deposits، withdrawals، enterprise، white-label یا public financial rewards.

## محدوده بررسی

| سطح | وضعیت |
| --- | --- |
| کل routeها | 175 صفحه |
| مسیرهای English | 62 صفحه |
| مسیرهای Academy | 65 صفحه |
| English subtree | نشت مستقیم متن فارسی در `src/app/en` پیدا نشد |
| Product readiness authority | 34/41 evidence-ready، 7 blocker بیرونی، weighted readiness: 63.8% |
| Route-scoped SEO/AEO/GEO debt | 85 route |
| Visual QA matrix | 700 desktop/mobile RTL/LTR screenshot slot هنوز باید پر شود |

## تست‌ها و evidence اجراشده

| دستور | نتیجه |
| --- | --- |
| `node scripts/check-ui-style-authority.mjs` | PASS |
| `node scripts/check-public-ui-foundation.mjs` | PASS |
| `node scripts/check-brand-asset-authority.mjs` | PASS |
| `node scripts/check-academy-arena-mentor-accessibility-evidence.mjs` | PASS |
| `node scripts/check-browser-persistence.mjs` | PASS |
| `node scripts/check-enterprise-global-product-readiness.mjs` | PASS، اما با 7 blocker بیرونی |
| `node scripts/check-release-gate-coverage.mjs` | PASS |
| `node --test scripts/enterprise-global-product-readiness.test.mjs scripts/repository-audit-manifest.test.mjs scripts/repository-audit-workflow-policy.test.mjs` | PASS، 23 تست |

## محدودیت‌های مهم این نوبت

| محدودیت | اثر روی QA |
| --- | --- |
| `node_modules` ناقص است و `.bin/eslint`، `.bin/tsc` و Next CLI وجود ندارد | lint/typecheck/dev-server در این checkout قابل اتکا نبود |
| dev server بالا نیامد | visual audit با screenshot واقعی انجام نشد |
| `npm run ...` در محیط اجرا به cache/install issue خورد | نتیجه سبز کامل برای lint/build/e2e ادعا نشده است |
| PR #526 هم‌زمان باز و Draft است | هیچ promotion یا merge نباید بدون re-read نهایی main/PR/checks انجام شود |

## اصلاحات اعمال‌شده در همین branch

| Before | After | Why |
| --- | --- | --- |
| CTAهای Mentor/Academy/Arena با `from-cyan-500 to-violet-500` | گرادیان رسمی‌تر `from-cyan-500 to-blue-700` | حذف drift بنفش/AI-template و نزدیک‌تر شدن به هویت آبی/سایان TecPey |
| چند کنترل پرتکرار آموزشی با `transition-all` | transition محدود به `transform`, `opacity`, `width`, `border-color`, `background-color` | کاهش paint/layout risk و رفتار قابل پیش‌بینی‌تر در interaction |
| بعضی CTAهای Smart Center بدون focus/press detail کافی | `focus-visible` و `active:scale` اضافه شد | حس responsive و keyboard visibility بهتر |
| reduced-motion فقط بخشی از animationها را پوشش می‌داد | `animate-shimmer`, `animate-fadeSlideDown`, `swap-arrow-float` هم پوشش گرفتند | کاهش motion برای کاربر حساس به حرکت |

## یافته‌های اولویت‌دار

| اولویت | یافته | شاهد | اقدام پیشنهادی |
| --- | --- | --- | --- |
| P0 | Launch هنوز GO نیست | main و PR #526 هر دو صریحاً NO-GO را حفظ کرده‌اند؛ blockerهای NOG-01/02/05/07/08/09 باقی‌اند | ادعای محصول مالی/enterprise ممنوع بماند تا evidence بیرونی کامل شود |
| P1 | Runtime visual QA کامل هنوز evidence ندارد | 700 screenshot slot در authority registry باقی است و dev server این checkout بالا نیامد | بعد از dependency restore، screenshot matrix برای 375/768/1024/1440 و FA/EN اجرا شود |
| P1 | Toolchain محلی ناقص است | نبودن `node_modules/.bin/eslint`, `typescript`, Next CLI | dependency rehearsal یا clean install قابل تکرار روی runner/CI نیاز است |
| P1 | UI debt خام هنوز زیاد است | scan خام 717 مورد از radius/motion/brand/localStorage/hover/transition patterns | به batchهای کوچک route-family تقسیم شود، نه rewrite بزرگ |
| P1 | JSON-LD route-scoped debt هنوز مانده | authority: 85 route | burn-down SEO/AEO/GEO در batch جدا |
| P2 | `transition-all` هنوز در برخی componentها باقی است | Markets/Crypto/Academy v2/community surfaces | بعدی: Markets/Crypto، سپس Community/Academy legacy surfaces |
| P2 | بنفش هنوز به‌عنوان accent در چند بخش Mentor/Academy هست | `violet` در MentorChallenge، Academy AI Guide، community widgets | جایگزینی تدریجی با cyan/blue/amber/emerald semantic tokens |
| P2 | radiusهای بسیار بزرگ در چند surface دیده می‌شود | `rounded-[30px]`, `rounded-[34px]`, `rounded-[40px]` | کاهش فقط در page families که کارت/پنل عملیاتی‌اند؛ landing/hero را جدا بررسی کن |
| P2 | browser persistence باقی است ولی guard شده | `check-browser-persistence` می‌گوید 25 classified line در 7 production file باقی است | migration-only/local projectionها را یکی‌یکی کم کن؛ source-of-truth ممنوع بماند |

## مسیر تبدیل ایرادها به نقطه قوت

1. **Visual Evidence First:** اول visual QA matrix را بساز تا هر صفحه قبل/بعد اسکرین‌شات داشته باشد.
2. **Brand Drift Burn-down:** همه purple/violet/pinkهای غیرمعنایی را به tokenهای رسمی TecPey یا semantic state تبدیل کن.
3. **Interaction Discipline:** `transition-all` و hover-only behavior را از مسیرهای پرتکرار حذف کن.
4. **Academy Mobile Quality:** Academy چون 65 صفحه دارد باید batch اول mobile-first QA باشد.
5. **Markets/Crypto Trust UI:** جدول‌ها، نمودارها، loading/error/degraded states و number formatting باید دقیق‌تر دیده شوند.
6. **Runtime Accessibility:** keyboard, focus order, reduced motion, contrast و target-size با browser evidence تست شود.
7. **Launch Copy Authority:** هر صفحه‌ای که به exchange/financial capability اشاره می‌کند باید launch-gated و بدون overclaim بماند.

## Batch پیشنهادی بعدی

| Batch | Scope | خروجی قابل قبول |
| --- | --- | --- |
| A | restore toolchain و اجرای lint/typecheck/build/e2e | evidence واقعی یا blocker دقیق |
| B | screenshot matrix موج اول: `/`, `/academy`, `/academy/free`, `/markets`, `/coins`, `/trading-tools`, `/crypto-news`, `/en` | desktop/mobile FA/EN screenshots + findings |
| C | Markets/Crypto interaction cleanup | حذف transition-all، target size، table overflow و empty/error states |
| D | Academy v2 polish pass | quiz/flashcard/mentor responsive QA و motion discipline |
| E | SEO/AEO/GEO route debt | کاهش 85 route-scoped debt با تست authority |

