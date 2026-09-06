# TecPey Content Automation OS v1

Status: draft-only architecture and implementation registry
Scope: News Intelligence, Organic Growth, Social Distribution, Mentor hooks, Academy/Term 8 hooks
Safety mode: no auto-publish until human review and admin controls are proven

## 1. Product goal

TecPey Content Automation OS turns verified market/news/research signals into reusable educational and growth assets:

- crypto news cards and daily archives
- trend intelligence for coins, tools, topics, and risks
- AI Mentor context and suggested learning prompts
- Academy and Term 8 learning hooks
- draft posts for Telegram, X, LinkedIn, Instagram, Shorts/Reels scripts
- internal alerts for high-risk/high-impact changes

This system is not a signal-selling engine and must not publish investment advice.

## 2. Locked operating principles

1. Education-first, not financial advice.
2. Source-backed or fail-closed.
3. Draft-only by default.
4. Human review required before public social publishing.
5. Numbers, dates, prices, percentages, names, and URLs must survive translation.
6. Unsupported claims are rejected or marked for review.
7. Low-trust assets can be tracked, but must be clearly labeled as high-risk / educational watch only.
8. User-facing ranking must explain what score means.
9. Persian and English outputs must preserve locale quality and directionality.
10. Admin must be able to disable each destination independently.

## 3. Source layers

### L1 News and research
- CoinDesk
- Cointelegraph
- Decrypt
- The Block
- Blockworks
- The Defiant
- Bitcoin Optech
- Chainalysis
- SEC and regulator feeds

### L2 Market and on-chain context
- price movement
- volume
- volatility
- liquidity
- exchange flow
- ETF flow
- security/risk events

### L3 Social and community signals
Future gated sources:
- X
- Telegram
- YouTube
- Reddit
- LinkedIn
- Instagram
- GitHub/research feeds

Social signals must never be enough alone for public trend ranking unless marked as low confidence.

## 4. Output destinations

All destinations start as draft-only:

- TecPey News
- Daily News Archive
- Trend Intelligence
- Coin pages
- Tool pages
- Mentor context
- Academy quiz ideas
- Term 8 “Infinite Growth” insight queue
- Telegram post draft
- X post draft
- LinkedIn post draft
- Instagram carousel/reel script draft
- Shorts/Reels script draft
- Internal admin alert

## 5. Quality gates

### Evidence gates
- source URL required
- source name/domain required
- fetchedAt/publishedAt required when available
- source family and trust tier required
- exact quote avoidance / paraphrase policy
- short feed summary must not masquerade as full article

### Translation gates
- numeric fact preservation
- no invented numeric facts
- no deleted numeric facts
- no unsupported Latin entities
- directionality isolation for LTR entities in RTL text
- summary expansion bounded by source evidence
- Persian readability and punctuation review

### Financial safety gates
- no direct buy/sell command
- no guaranteed return
- no leverage recommendation
- no individualized investment advice
- risky/meme/low-trust assets marked as educational watch
- “trend” means research lead, not trading signal

## 6. Ranking and scoring labels

User-facing score labels must be explicit:

- اثر بازار
- اهمیت آموزشی
- ریسک خبری
- کیفیت شواهد
- اعتماد منبع
- تازگی خبر

Avoid ambiguous labels such as “اثر 9/10” without context.

## 7. Trend Intelligence UX rules

If evidence is insufficient, empty states must explain why:

- “در حال جمع‌آوری سیگنال‌های معتبر؛ فعلاً مورد قابل اتکا برای نمایش عمومی وجود ندارد.”
- show last updated
- show source policy
- optionally show “در حال بررسی” when single-source evidence exists

Low-trust or meme assets must not look like endorsed opportunities.

## 8. Automation modes

- disabled
- draft_only
- scheduled_review
- manual_review_required
- auto_publish_low_risk: prohibited until separate approval and evidence

Current v1 must stay draft_only/manual_review_required.

## 9. Admin controls required

Admin must be able to control:

- source enable/disable
- destination enable/disable
- locale enable/disable
- minimum source trust
- minimum source count
- social destination status
- allowed content formats
- reviewer requirement
- emergency stop
- stale feed behavior
- IndexNow/search submission settings

## 10. Mentor and Term 8 hooks

Content automation can feed Mentor and Term 8 only through verified summaries:

- daily market context
- high-impact news explainer
- risk vocabulary
- quiz idea draft
- scenario/challenge draft
- “why it matters” explanation
- no personalized trading instruction

Term 8 “Infinite Growth” must receive structured insight cards, not raw feed text.

## 11. Mobile/product QA backlog from staging screenshots

These are intentionally tracked here so they are not lost while News automation is completed.

### P1 Mobile Signup/Auth
- iPhone 13 signup viewport is clipped/off-canvas.
- Remove placeholders containing personal names such as Mannan or crypto_mannan.
- Replace with neutral professional placeholders.
- Move Iranian mobile verification into identity/KYC or verification flow, not mandatory initial account creation.
- Redesign login/signup as first app screen using modern Apple-like clarity, spacing, hierarchy, safe areas, and touch targets.
- Connect real Google and Apple sign-in after OAuth production configuration.
- Disabled OAuth buttons must be visually clear or hidden until usable.

### P1 Mobile Market Board
- Current table clips horizontally on mobile.
- Convert mobile market view to card/list layout.
- Preserve coin identity, live price, 24h movement, and volume without horizontal overflow.

### P1 Mobile Safe Area
- Sticky CTAs, mentor input, and bottom content must respect iOS safe area and Safari bottom bar.
- Add bottom padding using env(safe-area-inset-bottom) plus app-specific spacing.

### P1 News/Trend UX
- Make score labels explicit.
- Improve mixed Persian/English entity rendering with LTR isolation.
- Improve empty states for tools/topics.
- Add reputational risk labeling for meme/low-trust trend assets.

## 12. Acceptance checklist

Before this system is allowed beyond draft-only:

- source registry has trust tiers
- output destination registry exists
- quality gates are tested
- admin controls are documented
- no auto-publish path exists without explicit approval
- mobile clipping issues have separate tracked PR
- rate-limit Redis production requirement is tracked
- optional navbar profile 404 is tracked
- staging evidence includes health, news, market, academy, and timer checks
