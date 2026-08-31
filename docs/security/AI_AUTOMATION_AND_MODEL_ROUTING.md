# اتوماسیون و مسیریابی مدل در TecPey

**نسخهٔ سیاست:** `2026-08-30.2`
**مایگریشن‌ها:** `0092_ai_automation_orchestration.sql` و `0096_ai_tenant_row_level_security.sql`

## مرز اختیار

اتوماسیون TecPey یک صف کار ساده نیست؛ هر اجرا یک policy snapshot تغییرناپذیر، state machine پایدار، quorum مشخص و evidence الحاقی دارد. هیچ مدل زبانی اجازهٔ انتشار، ارتقای دانش، تغییر دادهٔ پلتفرم یا اثر مالی مستقیم ندارد.

ترتیب گیت‌ها:

1. `queued`؛ ثبت idempotent و tenant/workspace scoped؛
2. `ai_review`؛ رأی ایجنت‌های تعیین‌شده با lease محدود؛
3. `manager_review`؛ رأی مدیر مجاز و مستقل؛
4. `c_level_review`؛ رأی یک C‑Level مجاز و مستقل؛
5. `approved`؛ فقط پس از تحقق تمام quorumها؛
6. `executing`؛ فقط با claim یک executor دامنه‌ای و idempotent؛
7. وضعیت نهایی `completed`، `failed`، `rejected` یا `blocked`.

یک رأی `reject` اجرا را متوقف می‌کند. درخواست‌کننده نمی‌تواند کار خودش را تأیید کند و یک مدیر در یک run فقط یک‌بار شمرده می‌شود؛ بنابراین نمی‌تواند هم سهم Manager و هم سهم C‑Level را پر کند. trigger دیتابیس نقش واقعی مدیر را از `admin_user_roles` بازسازی می‌کند و آرایهٔ نقش دریافتی از API را authority نمی‌داند.

نسخهٔ policy داخل هر run قفل می‌شود. سیاست قدیمی تا ثبت دوباره اجرا نمی‌شود و خاموش‌کردن policy یک kill switch است: runهای هنوز اجرا‌نشده فوراً `blocked` می‌شوند. lease منقضی‌شدهٔ executor به‌طور خودکار retry نمی‌شود، چون اثر بیرونی ممکن است نیمه‌کاره انجام شده باشد؛ run با `execution_lease_expired` شکست می‌خورد و برای reconciliation انسانی علامت می‌خورد تا side effect تکراری ساخته نشود.

## Workflowهای ثابت

| Workflow | AI quorum | Manager | C‑Level | اثر بیرونی | fallback رایگان |
|---|---:|---:|---:|---|---|
| `public_intelligence_digest` | 3 | 0 | 0 | ندارد؛ candidate داخلی | فقط public |
| `content_publication` | 2 | 1 | 1 | انتشار توسط executor محتوا | ممنوع |
| `knowledge_promotion` | 2 | 1 | 1 | ارتقای دانش توسط executor دانش | ممنوع |
| `executive_operating_review` | 2 | 1 | 1 | ندارد | ممنوع |
| `provider_budget_failover` | 0 | 0 | 0 | تصمیم مسیریابی داخلی | فقط public |

تعریف نقش‌ها، quorum، کلاس داده و اثر بیرونی در `src/lib/ai/automation-catalog.ts` قفل است. پنل فقط فعال‌بودن، فاصلهٔ زمان‌بندی و concurrency را در محدودهٔ این قرارداد تغییر می‌دهد. فعال‌سازی fail closed است: ایجنت‌های لازم باید آماده باشند، تعداد reviewerهای انسانی فعال برای هر گیت کافی باشد و مجموع انسان‌های مستقل نیز quorum ترکیبی Manager و C‑Level را پوشش دهد. در اجرای دستی، درخواست‌کننده از ظرفیت reviewerها حذف و دوباره کنترل می‌شود.

## OpenRouter و fallback بودجه

ترتیب تصمیم:

1. Provider اصلی و fallback model همان Provider؛
2. در `402`، `429`، timeout، circuit-open یا خطای شبکه، بررسی محدود و bounded وضعیت کلید OpenRouter؛
3. اگر اعتبار از کف تنظیم‌شده بیشتر باشد، مدل پولی OpenRouter؛
4. فقط برای دادهٔ `public`، کار `noncritical`، بدون اثر بیرونی و فقط در دو ایجنت پژوهش عمومی: `openrouter/free`؛
5. در تمام حالت‌های دیگر fail closed.

هر فراخوانی OpenRouter با `zdr: true` و `data_collection: "deny"` ارسال می‌شود. مدل رایگان برای Mentor، متن خصوصی کاربر، دادهٔ مدیر، دادهٔ تجمیعی اختصاصی، انتشار، ارتقای دانش یا تصمیم حساس ممنوع است. نام `openrouter/free` یا variantهای `:free` نیز نمی‌تواند به‌عنوان مدل مستقیم ایجنت خصوصی ثبت شود.

محدودیت مهم: free router مدل واجد شرایط را به‌صورت پویا انتخاب می‌کند و برای ظرفیت بالا یا SLA سازمانی مناسب نیست. fallback رایگان یک مسیر degradation برای پژوهش عمومی کم‌ریسک است، نه جایگزین بودجهٔ production.

مراجع رسمی:

- [OpenRouter model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks)
- [OpenRouter free router](https://openrouter.ai/docs/guides/routing/routers/free-router)
- [OpenRouter key limits](https://openrouter.ai/docs/api_reference/limits)
- [OpenRouter provider routing and ZDR](https://openrouter.ai/docs/guides/routing/provider-selection)
- [OpenRouter provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging)

## اجرای worker

> **Controlled launch:** در این release همهٔ bindingهای executor در
> `automation-executor-registry.ts` عمداً `launchReady: false` هستند. تا زمانی
> که output authority، connector idempotent و reconciliation evidence هر
> workflow کامل نشده باشد، policy فعال نمی‌شود، run تازه enqueue/claim نمی‌شود
> و executor داخلی نیز start نمی‌شود. رأی governance به‌تنهایی artifact اجرا
> نیست و هرگز نباید به `completed` تبدیل شود.
>
> علاوه بر readiness مستقل executor، gate سراسری
> `ai_tenant_isolation_unresolved:signed_rls_runtime_evidence_pending`
> نیز hard-closed است. هیچ feature flag یا متغیر worker آن را باز نمی‌کند. worker
> ابتدا recovery اجرا می‌کند و سپس بدون enqueue/claim در وضعیت `blocked` می‌خوابد؛
> reject و finalize اجرای ازپیش leased برای پاک‌سازی/evidence همچنان بسته نمی‌شوند.
> مسیر جمع‌آوری شاهد redacted و attested در محیط محافظت‌شدهٔ PostgreSQL 16 در
> [AI tenant database integrity](./AI_TENANT_DATABASE_INTEGRITY.md#protected-postgresql-16-runtime-evidence)
> تعریف شده است. موفقیت آن workflow شرط لازم است، اما به‌تنهایی این NO-GO را
> حذف نمی‌کند؛ admission شواهد و provision محیط‌های staging/production باید در
> یک commit مستقل و قابل ممیزی انجام شود.

پس از مایگریشن و تنظیم Provider/Agentها در Command Center، worker جداگانه اجرا می‌شود:

```bash
TECPEY_DATABASE_PROCESS_ROLE=ai_worker \
AI_AUTOMATION_WORKER_ENABLED=true npm run ai:automation:worker
```

process وب فقط `TECPEY_AI_TENANT_DATABASE_URL` و secret امضای context را دریافت
می‌کند. process worker علاوه بر آن‌ها `TECPEY_AI_WORKER_DATABASE_URL` جداگانه
دارد تا claim سراسری صف با نقش محدود انجام و ادامهٔ کار روی scope انتخاب‌شده با
نقش tenant اجرا شود. هیچ‌کدام نباید credential مایگریشن را دریافت کنند.

فرمان executor داخلی رزرو شده است، اما در controlled launch فعلی عمداً fail
closed است و تا آماده‌شدن output authority شروع نمی‌شود:

```bash
AI_AUTOMATION_INTERNAL_EXECUTOR_ENABLED=true npm run ai:automation:internal-executor
```

برای probe یک‌مرحله‌ای:

```bash
TECPEY_DATABASE_PROCESS_ROLE=ai_worker \
AI_AUTOMATION_WORKER_ENABLED=true \
AI_AUTOMATION_RUN_ONCE=true npm run ai:automation:worker
```

متغیر `AI_AUTOMATION_POLL_MS` بین ۵۰۰ و ۳۰٬۰۰۰ میلی‌ثانیه محدود است. هیچ process بدون feature flag صریح شروع نمی‌شود. worker بازبینی prompt یا output خام را log نمی‌کند و executor داخلی فعلی هیچ run را claim یا تکمیل نمی‌کند. هر دامنه باید پیش از `launchReady` شدن، executor مستقل خود را با `claimApprovedAiAutomationExecution`، connector دقیق، idempotency اثر و evidence نهایی متصل کند.

## راه‌اندازی عملیاتی

1. اجرای `npm run db:migrate` با principal مستقل مایگریشن و تأیید schema readiness؛
2. provision نقش‌های login محدود، context key/version و اجرای تست واقعی tenant A/B بدون skip؛
3. ثبت و تست کلید OpenRouter در `Command Center → AI Control Plane`؛
4. ثبت مدل پولی، کف اعتبار و اجازهٔ free فقط روی ایجنت‌های public؛
5. انتساب حداقل دو انسان مستقل برای workflowهای دارای Manager و C‑Level؛
6. فعال‌کردن policyها از پنل با step-up؛
7. اجرای worker و internal executor در process/containerهای جدا با restart policy و health monitoring؛
8. اتصال executor هر اثر بیرونی پس از تست idempotency، rollback و audit؛
9. پایش `ai_provider_quota_snapshots`، runهای `blocked/failed` و زمان انتظار گیت‌های انسانی.

## شواهد و نگه‌داری

جدول‌های policy event، review، quota snapshot و run event append-only هستند. citationهای پاک‌سازی‌شده کنار رأی AI نگه‌داری می‌شوند، اما prompt و output خام ذخیره نمی‌شوند. metadata اجازهٔ کلیدهایی مانند prompt، message، input، output، token، cookie یا authorization را ندارد. متن run فقط برای کلاس‌های غیرخصوصی پذیرفته می‌شود و ورودی دارای Secret، شناسهٔ مستقیم، دادهٔ مالی شخصی یا prompt injection پیش از صف رد می‌شود.

## بررسی

```bash
npm run typecheck
npm run test:ai-mentor-trust
npm run migrations:check
npm run tenant:isolation:check
npm run api:security:check
npm run build
```

تست‌های PostgreSQL با دیتابیس آزمایشی و هر دو URL محدود AI اجرا می‌شوند و برای release واقعی نباید skip باقی بمانند.
