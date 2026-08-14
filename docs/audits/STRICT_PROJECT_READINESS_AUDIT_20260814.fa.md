# گزارش فوق‌سختگیرانه‌ی آمادگی پروژه TecPey — ۱۴ اوت ۲۰۲۶

**Repo:** `tecpey/Tecpey-Os`
**Base:** `main` پس از merge PR #439 روی candidate پروموت‌شده‌ی PR #435 و fixهای PR #434/#436/#438
**Original audit SHA:** `c2b5e58f23881635ebf507827158550a44d3f9b5`
**Current revalidation SHA:** `b55860d8444db9c1b1020f1240816a229b1a2944`
**Launch candidate رسمی هنگام شروع audit:** `5d68865dd56331e011829749ee970d097e9b14a4`
**Post-audit remediation refresh:** بعد از merge شدن PR #436، PR #438 و PR #439 روی خط لانچ، candidate در همین شاخه به `b55860d8444db9c1b1020f1240816a229b1a2944` re-baseline شد؛ publish/PR هنوز جداگانه تصمیم می‌خواهد.
**حکم کوتاه:** کد و CI فعلی سالم‌اند؛ کنترل لانچ هنوز **NO-GO** است.

> این گزارش جایگزین audit قبلی نیست؛ delta و بازبینی سختگیرانه روی `main` فعلی است. ضمیمه‌ی فایل‌به‌فایل در `docs/audits/evidence/strict-file-inventory-20260814.json` و `docs/audits/evidence/strict-file-inventory-20260814.csv` تولید شد.

---

## ۱. حکم اجرایی

| محور | وضعیت سختگیرانه | دلیل |
|---|---|---|
| سلامت main بعد از PR #439 | ✅ سالم | ۸ workflow روی `b55860d` با event `push` سبز شد. |
| TypeScript | ✅ سالم | `tsc --noEmit --pretty false` با exit 0 اجرا شد. |
| حاکمیت API/security | ✅ قوی | manifest امنیت API، audit mutation حساس، tenant و session guardها پاس شدند. |
| فایل‌به‌فایل/مقیاس repo | 🟡 بزرگ و نیازمند مالک‌داری | 2451 فایل tracked؛ 1862 فایل خارج از vendor charting؛ 155 اسکریپت. |
| کنترل لانچ | 🔴 NO-GO | audit اولیه نشان داد candidate رسمی عقب است؛ بعد از PR #436/#438/#439، target فعلی باید `b55860d` باشد. Re-baseline محلی انجام شد، اما Go هنوز به شواهد عملیاتی وابسته است. |
| protected staging و ops evidence | 🔴 NO-GO | NOG-01/02/05/07/08/09 باز هستند. |
| real-money Exchange/custody/withdrawals | 🔴 NO-GO برای فعال‌سازی | فقط به‌عنوان launch-disabled/product-disabled پذیرفته شده‌اند، نه آماده‌ی فعال‌سازی. |
| controlled education/Mentor/virtual Arena | 🟡 نزدیک‌تر، اما نه GO | کد و guardها قوی‌اند؛ شواهد عملیاتی و امضاهای owner هنوز مانده‌اند. |

**نتیجه:** قدم منطقی بعدی، feature جدید نیست. قدم درست، **promotion/re-baseline کردن controlled launch candidate به `b55860d`** و سپس اجرای evidence واقعی protected staging/recovery/incident/signoff روی همان SHA است. مرحله‌ی re-baseline در ادامه‌ی همین شاخه محلی انجام شد.

---

## ۲. شواهد اجرا و CI

### GitHub workflows روی merge commit فعلی

| Workflow | نتیجه | لینک |
|---|---|---|
| CI | ✅ success | [run](https://github.com/tecpey/Tecpey-Os/actions/runs/31811425650) |
| Full Suite Diagnostics | ✅ success | [run](https://github.com/tecpey/Tecpey-Os/actions/runs/31811425711) |
| API Security Manifest | ✅ success | [run](https://github.com/tecpey/Tecpey-Os/actions/runs/31811425520) |
| Sensitive Mutation Audit | ✅ success | [run](https://github.com/tecpey/Tecpey-Os/actions/runs/31811425672) |
| Repository Audit Manifest | ✅ success | [run](https://github.com/tecpey/Tecpey-Os/actions/runs/31811425655) |
| Public Browser Golden Path | ✅ success | [run](https://github.com/tecpey/Tecpey-Os/actions/runs/31811425576) |
| Container Supply Chain | ✅ success | [run](https://github.com/tecpey/Tecpey-Os/actions/runs/31811425601) |
| Full History Secret Scanning | ✅ success | [run](https://github.com/tecpey/Tecpey-Os/actions/runs/31811425761) |

### Local/guard checks که در همین audit استفاده شدند

| دسته | نتیجه |
|---|---|
| `./node_modules/.bin/tsc --noEmit --pretty false` | ✅ pass |
| repository hygiene JSON | ✅ pass؛ suspicious artifact ندارد؛ دو فایل CSS صفر بایتی در vendor charting ثبت شده‌اند. |
| API security manifest | ✅ pass؛ ۷۳ operation و ۰ finding فعال بعد از baseline/override دقیق. |
| browser persistence authority | ✅ pass؛ ۲۵ خط classified در ۷ production file. |
| tenant principal/table/request guards | ✅ pass؛ ۴۴ جدول tenant-scoped ثبت و با تست خصمانه پوشش داده شده‌اند. |
| auth/session/revocation | ✅ pass |
| withdrawal/custody launch gates | ✅ pass برای disabled/gated boundary؛ نه برای real custody activation. |
| exchange order/reconciliation authority | ✅ pass برای authority/gate فعلی. |
| academy/community/notifications/offline/news growth guards | ✅ pass |
| launch evidence verifier tests | ✅ ۵۷ تست pass؛ final packet بدون manifest عمداً fail-closed است. |

محدودیت روش: wrapperهای `npm run ...` در sandbox با سیاست network/approval رد شدند؛ جایی که لازم بود، local binaries و `node scripts/...` مستقیم اجرا شدند. خود GitHub Actions روی `main` این محدودیت را ندارد و سبز است.

---

## ۳. وضعیت NOG و لانچ

| Gate | وضعیت | عنوان | پیگیری |
|---|---|---|---|
| NOG-01 | 🔴 open | Protected staging activation evidence is missing | [issue](https://github.com/tecpey/Tecpey-Os/issues/365) |
| NOG-02 | 🔴 open | Production-like environment configuration is not proven | [issue](https://github.com/tecpey/Tecpey-Os/issues/365) |
| NOG-03 | ✅ accepted | Immutable runtime image digest is recorded | — |
| NOG-04 | ✅ accepted | Exact-head workflow URLs are attached for the current candidate | — |
| NOG-05 | 🔴 open | Backup, restore and recovery reconciliation evidence is missing | [issue](https://github.com/tecpey/Tecpey-Os/issues/407) |
| NOG-06 | ✅ accepted | Rollback and volume-restore evidence is attached for the current candidate | — |
| NOG-07 | 🔴 open | Incident readiness evidence is missing | [issue](https://github.com/tecpey/Tecpey-Os/issues/408) |
| NOG-08 | 🔴 open | Accepted-risk owner sign-off evidence is missing | [issue](https://github.com/tecpey/Tecpey-Os/issues/409) |
| NOG-09 | 🔴 open | Go approval matrix is missing | [issue](https://github.com/tecpey/Tecpey-Os/issues/410) |
| NOG-10 | ✅ accepted | Real-money Exchange remains uncertified | — |
| NOG-11 | ✅ accepted | Custody, deposits and withdrawals remain uncertified | — |
| NOG-12 | ✅ accepted | Enterprise, white-label and public rewards remain outside launch scope | — |

نکته‌ی سختگیرانه: هنگام شروع audit، حتی NOGهای accepted فعلی هم برای candidate `5d68865d` ثبت شده بودند. بعد از PR #433 target به `c2b5e58f` رسید، بعد از PR #434 به `389c1fed` رسید، و بعد از merge شدن PR #436/#438/#439، head فعلی `b55860d` شد. طبق خود ledger باید target جدید به‌عنوان candidate promote شود یا شواهد launch روی همین head بازتولید/ضمیمه شود. این هماهنگ‌سازی در ادامه‌ی همین شاخه محلی انجام شد؛ NOGهای عملیاتی همچنان باز هستند و target قبلی `389c1fed` اکنون superseded است.

---

## ۴. نقشه‌ی فایل‌به‌فایل

| دسته | تعداد فایل |
|---|---:|
| third-party-vendor-asset | 589 |
| documentation | 266 |
| test | 250 |
| app-route-or-page | 211 |
| library | 209 |
| public-asset | 206 |
| guard-or-tooling-script | 156 |
| repo-config-or-root | 110 |
| api-route | 100 |
| react-component | 99 |
| security-doc | 88 |
| security-authority | 50 |
| exchange-trading-library | 25 |
| launch-evidence-doc | 21 |
| wallet-custody-library | 19 |
| github-workflow | 14 |
| notification-library | 14 |
| operations-doc | 13 |
| audit-doc | 9 |
| migration | 2 |

| اولویت review | تعداد فایل |
|---|---:|
| P0-code-review | 280 |
| P0-stale-launch-line | 2 |
| P1-code-review | 146 |
| P1-evidence-review | 120 |
| P1-release-guard-review | 172 |
| P2-general-review | 632 |
| P2-product-review | 291 |
| P3-asset-or-vendor-review | 808 |

| دامنه | تعداد فایل مرتبط |
|---|---:|
| public-ui | 375 |
| academy-mentor | 340 |
| ops-launch-evidence | 260 |
| auth-session | 235 |
| community-arena | 161 |
| wallet-withdrawal-custody | 126 |
| news-growth | 101 |
| tenant-principal | 83 |
| exchange-ledger | 71 |
| notifications | 56 |
| admin-control-plane | 54 |

ضمایم ماشینی:

- JSON: `docs/audits/evidence/strict-file-inventory-20260814.json`
- CSV: `docs/audits/evidence/strict-file-inventory-20260814.csv`

هر ردیف شامل path، category، domain، اندازه، line count، markerهای `TODO/FIXME/HACK/localStorage/sessionStorage/indexedDB/stub/mock/demo/legacy`، اولویت review و concernهای readiness است.

---

## ۵. فایل‌های حساس برجسته‌شده

| فایل | دسته | score | علت |
|---|---|---:|---|
| `src/components/academy/GlobalAiMentorWidget.tsx` | react-component | 32 | browser-persistence-marker |
| `src/components/academy/AiMentorExperience.tsx` | react-component | 24 | browser-persistence-marker |
| `src/components/academy/AcademyMentorCoachCenter.tsx` | react-component | 20 | browser-persistence-marker |
| `src/lib/wallet/signing/keystore.ts` | wallet-custody-library | 20 | stub-marker |
| `src/lib/entity.ts` | library | 18 | debt-marker |
| `src/app/api/ai-mentor-v2/route.ts` | api-route | 12 | browser-persistence-marker, legacy-boundary-marker |
| `src/app/api/academy-auth/route.ts` | api-route | 8 | — |
| `src/app/api/academy-certificates/qr/[certificateId]/route.ts` | api-route | 8 | — |
| `src/app/api/academy-certificates/route.ts` | api-route | 8 | legacy-boundary-marker |
| `src/app/api/academy-flashcards/route.ts` | api-route | 8 | — |
| `src/app/api/academy-lead/route.ts` | api-route | 8 | — |
| `src/app/api/academy-lesson-assessment/route.ts` | api-route | 8 | — |

### Browser persistence در production source

| فایل | دسته | localStorage | sessionStorage | indexedDB | concern |
|---|---|---:|---:|---:|---|
| `src/app/api/ai-mentor-v2/route.ts` | api-route | 1 | 0 | 0 | browser-persistence-marker, legacy-boundary-marker |
| `src/components/academy/AcademyEngagementHub.tsx` | react-component | 2 | 0 | 0 | browser-persistence-marker |
| `src/components/academy/AcademyMentorCoachCenter.tsx` | react-component | 5 | 0 | 0 | browser-persistence-marker |
| `src/components/academy/AcademySimulationWorld.tsx` | react-component | 2 | 0 | 0 | browser-persistence-marker |
| `src/components/academy/AiMentorExperience.tsx` | react-component | 6 | 0 | 0 | browser-persistence-marker |
| `src/components/academy/GlobalAiMentorWidget.tsx` | react-component | 8 | 0 | 0 | browser-persistence-marker |
| `src/components/offline/OfflineSyncManager.tsx` | react-component | 1 | 0 | 0 | browser-persistence-marker, legacy-boundary-marker |

تفسیر: guard رسمی این‌ها را classified می‌داند، پس فعلاً blocker build/CI نیستند. اما برای readiness، هر مورد باید یا disposable/transport-only باقی بماند یا به PostgreSQL/server authority مهاجرت کند. حساس‌ترین cluster اینجا Mentor/Academy است.

### Debt/stub/mock در production source

| فایل | دسته | markerها |
|---|---|---|
| `src/lib/entity.ts` | library | TODO 6, FIXME 0, HACK 0, stub 0, mock 0 |
| `src/lib/error-tracking.ts` | library | TODO 1, FIXME 0, HACK 0, stub 1, mock 0 |
| `src/lib/i18n-locale.ts` | library | TODO 1, FIXME 0, HACK 0, stub 0, mock 0 |
| `src/lib/locale.ts` | library | TODO 0, FIXME 0, HACK 0, stub 1, mock 0 |
| `src/lib/mentor-events.ts` | library | TODO 2, FIXME 0, HACK 0, stub 0, mock 0 |
| `src/lib/mentor-signals.ts` | library | TODO 1, FIXME 0, HACK 0, stub 0, mock 0 |
| `src/lib/wallet/signing/keystore.ts` | wallet-custody-library | TODO 0, FIXME 0, HACK 0, stub 4, mock 0 |

تفسیر سختگیرانه:

- `src/lib/wallet/signing/keystore.ts`: HSM/MPC stub است؛ برای custody activation قطعاً NO-GO، ولی تا وقتی product-disabled باشد قابل قبول است.
- `src/lib/error-tracking.ts`: Sentry stub/fallback دارد؛ برای controlled launch باید provider واقعی یا accepted risk صریح داشته باشد.
- `src/lib/mentor-events.ts`: profile update درون‌پردازشی است؛ با رشد کاربر باید durable queue شود.
- `src/lib/compliance/sumsub.ts`: در production اگر config نباشد session را block می‌کند؛ در non-production mock برمی‌گرداند. برای real-money/compliance activation هنوز evidence provider لازم است.

---

## ۶. پیشرفت کلی پروژه

| حوزه | آمادگی مهندسی | آمادگی launch | توضیح |
|---|---|---|---|
| Public FA/EN + محصول آموزشی | بالا | متوسط رو به بالا | UI/Golden Path و product-truth guardها قوی‌اند، ولی staging evidence هنوز بسته نیست. |
| Auth/session/admin control | بالا | متوسط | session/tenant/admin tests قوی‌تر شده‌اند؛ PR #433 approval workflow را جلو برد. |
| Multi-tenant core | بالا | متوسط | ۴۴ جدول tenant-scoped با تست خصمانه؛ بعضی aggregateهای platform-level هنوز برای white-label نیاز به برنامه جدا دارند. |
| Academy/Mentor | بالا | متوسط | authority خوب است؛ browser storage و queue durability باید قبل از مقیاس‌دادن بسته یا risk-accepted شوند. |
| Virtual Arena/community | متوسط رو به بالا | متوسط | reputation/finalization evidence guard دارد؛ public ranking/rewards هنوز disabled است. |
| Notifications/offline | بالا | متوسط | durable authority و guardها سبز؛ operational replay/recovery باید در protected staging ثابت شود. |
| Exchange ledger/order | متوسط رو به بالا | پایین برای پول واقعی | authority/reconciliation gate سبز، اما provider، ambiguity recovery و real-money certification هنوز launch-disabled است. |
| Wallet/custody/withdrawal | متوسط برای gate | پایین برای activation | admission/settlement guardها قوی‌اند؛ HSM/MPC/chain-provider/on-chain evidence آماده نیست. |
| Ops/release/recovery | متوسط | پایین تا متوسط | بهترین مانع باقی‌مانده همین است: protected staging، restore reconciliation، incident drill، owner signoff، approval matrix. |

امتیاز رسمی launch را به درصد قطعی تبدیل نمی‌کنم چون خود checklist می‌گوید درصد فقط با evidence پذیرفته‌شده باید جابه‌جا شود. اما به‌صورت engineering readiness: **کد controlled scope حدود ۸/۱۰**؛ **آمادگی Go عملیاتی فعلی حدود ۴/۱۰**؛ **آمادگی real-money/custody activation حدود ۲/۱۰ تا ۳/۱۰**.

---

## ۷. کارهای مانده، به ترتیب منطقی

1. **Candidate promotion PR:** `docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md` و JSON ledger را از `5d68865d`، سپس `c2b5e58f` و `92ccb8f` به `b55860d` منتقل کن؛ دلیل: PR #436/#438/#439 بعد از PR #434 دوباره `main` را جلو برده‌اند. وضعیت: انجام‌شده در شاخه‌ی محلی.
2. **Re-attach exact-head evidence:** workflowهای سبز روی `b55860d` را وارد exact-head evidence کن؛ runtime image digest و rollback artifact را هم از Container Supply Chain همان SHA ثبت کن. وضعیت: انجام‌شده در شاخه‌ی محلی برای workflow/runtime/rollback evidence.
3. **Protected staging:** NOG-01/02 را با environment محافظت‌شده، runner درست، health/systemd/env redaction و artifact digest ببند.
4. **Recovery reconciliation:** NOG-05 را روی protected staging برای Academy/Arena/Mentor/Exchange/notifications/tenant/audit اجرا و verifier را pass کن.
5. **Incident readiness:** NOG-07 را با دو probe critical، latency، zero pending/quarantine و P0 acknowledgement ببند.
6. **Accepted-risk signoff:** NOG-08 را با ownerهای واقعی، تاریخ fresh، mitigation و rollback trigger امضا کن.
7. **Go approval matrix:** NOG-09 را بعد از شواهد بالا با CEO/CTO/Security/Product/Compliance/SRE/QA ببند.
8. **پس از GO narrow:** تازه بعدش backlogهای scale مثل Mentor queue، error tracking provider، storage cleanup، و white-label admin scoping را وارد موج بعدی کن.

---

## ۸. جمع‌بندی نهایی

PR #435، PR #434، PR #436، PR #438 و PR #439 از نظر engineering درست روی `main` نشسته‌اند و self-checkهای GitHub سبز هستند. پروژه از نظر کد «بی‌نظم یا خام» نیست؛ برعکس، guard و evidence discipline بسیار بالاست. مانع واقعی این است که repo خودش launch را fail-closed طراحی کرده و هنوز شواهد عملیاتی برای head فعلی وجود ندارد.

**حکم:** تا قبل از بستن NOG-01/02/05/07/08/09، هیچ ادعای GO نباید داده شود. بعد از remediation محلی، قدم بعدی اجرای evidence عملیاتی protected staging/recovery/incident/signoff روی `b55860d` است، نه اضافه‌کردن feature تازه.
