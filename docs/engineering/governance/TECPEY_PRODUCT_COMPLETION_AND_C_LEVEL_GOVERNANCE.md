# TecPey Product Completion and C-Level Governance Framework

Status: Governance draft for TecPey platform execution
Market priority: Iran-first, Persian-first, global-grade trust and certification
Scope: authenticated user experience, dashboard, profile, certificates, rankings, Academy, Trading Arena, Mentor, smart notifications, content automation, mobile and desktop

## 1. Core Principle

TecPey must not treat pages as isolated UI screens. Every product surface is a contract between product, growth, security, education, engineering, operations, and user trust.

Permanent product law:

Smart Notification Engine quality, correctness, personalization, safety, and measurement are permanent platform priorities. The system must be designed, implemented, reviewed, tested, and improved as one of TecPey's core product engines, equal in importance to Dashboard, Academy, Trading Arena, Mentor, and certificate trust.

Every page, feature, automation, and workflow must answer:

- What is the user's current state?
- What is the safest and most valuable next action?
- What trust, privacy, and security obligations exist?
- What data must be persisted server-side?
- What mobile and desktop experience is required?
- What SEO, AEO, GEO, and organic-growth metadata is required where the surface is public or content-generating?
- What notification, reminder, or re-engagement event should exist, and what user consent or preference controls are required?
- What evidence proves the surface is complete enough for launch?

## 2. Platform-Wide Completion Rule

No TecPey surface is considered complete only because it renders or passes a basic test. A surface is complete only when it satisfies product, UX, security, data, growth, accessibility, and evidence requirements.

Each surface must be classified as one of:

- Complete
- Incomplete product experience
- Needs backend contract
- Needs security/privacy hardening
- Needs mobile UX
- Needs desktop UX
- Needs SEO/AEO/GEO
- Needs analytics or ranking logic
- Needs smart notification/personalization logic
- Needs admin control
- Needs test/evidence
- Launch blocker

## 3. Required Product Surface Inventory

TecPey must maintain a living Product Surface Inventory covering at minimum:

- User home dashboard
- User profile
- Identity and certificate profile
- Certificate verification pages
- Monthly and all-time ranking
- Academy path, lessons, exams, seasons, certificates
- Trading Arena dashboard, challenges, journal, replay, scoring
- Mentor AI user guidance and review flows
- Smart notification center, preferences, delivery logs, and personalization rules
- News, coin, tool, and content automation
- Market board and coin pages
- Wallet and exchange entry states
- Admin control panel
- Notifications and security alerts
- Mobile views
- Desktop views
- Empty, loading, error, locked, pending, verified, rejected, and suspended states

## 4. User Home Dashboard Principles

The authenticated home page must act as the user's TecPey Command Center.

It must include:

- Clear next action for the user
- Academy progress and next lesson
- Trading Arena status and next challenge
- Mentor daily brief or guidance
- Security and account completion status
- Short ranking card with monthly and all-time tabs
- Top users list, such as Top 5 or Top 10
- A fixed row showing the current user's rank and score, even when the user is not in the visible top list
- Market/news/tool/coin highlights when relevant
- Clear entry to exchange using the approved label: "ورود به صرافی"

Ranking behavior:

- Monthly ranking and all-time ranking must be separate.
- The current user must always be visible in the ranking card.
- If the current user is in the top list, that row must be highlighted.
- If the current user is outside the top list, the user's row must appear at the bottom of the card.
- Ranking must be resistant to manipulation and should combine Academy progress, Trading Arena performance, consistency, quiz/exam quality, risk discipline, and anti-cheat signals.

## 5. User Profile and Certificate Identity Principles

The user profile must support ordinary account management and globally credible certificate issuance without exposing sensitive identity data.

Required profile groups:

- Public profile: display name, avatar, country, language, level, badges
- Account profile: legal first name, legal last name, email, phone, timezone
- Certificate identity: official name, nationality, date of birth, document type, passport or ID card number, document country, optional document image when required
- Education profile: Academy level, completed terms, certificates, ranking history
- Security profile: 2FA, passkeys, active sessions, login history, recovery status

Sensitive identity rules:

- Passport and ID card numbers must never be handled as ordinary visible text.
- Sensitive identifiers must be masked in UI, for example: `IR-****-2381`.
- Storage must be encrypted and access-controlled.
- Access must be logged in audit logs.
- Use must be purpose-limited to certificate issuance, verification, compliance, or support cases with authorization.
- Public certificate verification must not expose passport or ID card numbers.
- Certificates should expose certificate ID, user official name, course/level, issue date, issuer, QR verification, and validity status.
- User consent must be explicit before collecting identity data for certificate issuance.

## 6. Dashboard and Profile UX Requirements

Desktop:

- Dense but calm command-center layout.
- Persistent navigation for Academy, Arena, Mentor, Market, Tools, News, Wallet/Exchange, Profile, and Settings.
- Priority card for the next best action.
- Ranking, security, progress, and market intelligence visible without overwhelming the user.

Mobile:

- Mobile-first composition, not a shrunken desktop view.
- Bottom navigation with the core product areas.
- First screen must prioritize next action, account/security status, Academy continuation, Arena challenge, and ranking snapshot.
- Touch targets, Persian RTL text, and fixed primary actions must be checked on real mobile dimensions.

## 7. Content Automation and Organic Growth Rule

Every automation that collects, translates, summarizes, tags, or publishes content must enforce:

- Duplicate detection
- Source link retention
- Source credibility metadata
- Persian summary
- Thumbnail or visual asset where appropriate
- Time and original publication reference
- Topic, coin, tool, and entity tags
- Related content chain
- Canonical URL
- OpenGraph metadata
- Twitter/X metadata
- JSON-LD structured data
- SEO, AEO, and GEO readiness
- Admin review controls where publication risk is high

This rule applies to news, tools, coins, Academy updates, Mentor-generated lesson suggestions, and any public or semi-public content automation.

## 8. Smart Notification and Personalized Re-Engagement Rule

TecPey notifications must be treated as a product growth, learning, safety, and trust system, not as generic alerts.

Smart notification is the living language of TecPey Mentor and the platform. It must make the user feel that TecPey understands their current state, progress, risk, weaknesses, strengths, and next best action.

Implementation priority:

- Smart Notification Engine is a first-class platform system, not a later marketing add-on.
- Every major user journey must define notification triggers, suppression rules, personalization variables, and success metrics before it can be considered complete.
- Notification correctness must be tested with the same seriousness as product logic, because wrong timing, wrong personalization, or unsafe wording can damage trust.
- Notification performance must be measured continuously and improved through controlled experiments, not guesswork.
- Notification intelligence must evolve from rule-based triggers toward Mentor-assisted reasoning while preserving auditability, consent, and safety boundaries.

Smart notifications must be personalized by:

- Academy level and current term
- Last completed lesson
- Quiz/exam results and weak topics
- Trading Arena performance, risk score, journal behavior, and challenge status
- Ranking position, rank movement, and near-milestone opportunities
- Certificate eligibility and missing identity requirements
- User timezone, language, country, and preferred channel
- User activity recency and session frequency
- Mentor recommendations and pending safe next actions
- News, coin, and tool interests selected or inferred from user behavior

Allowed notification intents:

- Continue learning: remind the user of the next lesson or unfinished term.
- Reinforce progress: celebrate level-ups, certificates, ranking gains, streaks, and mastery.
- Recover safely: invite inactive users back with a low-friction next action.
- Reduce risk: warn about poor Arena risk discipline, overtrading patterns, or incomplete safety learning.
- Complete trust steps: remind the user to finish 2FA, profile, identity, or certificate readiness.
- Personalize content: deliver relevant news, coin, tool, or Academy updates based on user interests and level.
- Operational alerts: notify about security, account, certificate, support, or system events.

Hook and engagement principles:

- Hooks must be tied to real user value, not empty urgency.
- Use personal variables such as first name, level, rank delta, next lesson, weak topic, certificate status, Arena result, streak, and preferred market interests.
- Prefer "next best action" copy over generic marketing copy.
- Use curiosity ethically, for example: "سه اشتباه پرتکرار توی ژورنال آرنای این هفته‌ات مشخص شده" only when backed by real analysis.
- Use near-miss motivation carefully, for example: "فقط ۲ امتیاز تا ورود به Top 50 ماهانه فاصله داری" only when accurate.
- Avoid profit promises, fear-based market pressure, gambling language, or notifications that push reckless trading.
- Frequency must be capped by category, user state, and channel.
- Every non-critical notification category must support opt-out or preference control.

Voice and Mentor language principles:

- The notification voice must feel like a precise, kind, professional, alert mentor.
- The voice must not feel like generic marketing, spam, or trading signal promotion.
- Each notification must have a real reason, at least one user-specific variable, one clear next action, and one safety boundary when relevant.
- Messages should be short, contextual, and action-oriented.
- The system should know when to encourage, warn, congratulate, remind, or stay quiet.
- The language must respect Persian-first quality and avoid awkward translated phrasing.
- Mentor-driven notifications should explain why the user is receiving the message when the trigger is not obvious.

Recommended notification formula:

`real user event + personal variable + meaningful hook + safe next action + measurable outcome`

Example patterns:

| Pattern | Example |
| --- | --- |
| Learning continuation | `فقط یک درس تا فعال شدن آزمون سطح بعدی فاصله داری. ادامه بده از: {next_lesson_title}` |
| Rank movement | `رتبه ماهانه‌ات {rank_delta} پله بهتر شده. فقط {points_to_next_milestone} امتیاز تا milestone بعدی مانده.` |
| Risk coaching | `در آرنای این هفته، ورودهای عجولانه بیشترین اثر منفی را روی امتیازت داشته. تمرین کوتاه مدیریت ورود آماده است.` |
| Certificate completion | `برای آماده شدن گواهی {certificate_name} فقط تکمیل هویت رسمی باقی مانده است.` |
| Personalized content | `بر اساس علاقه‌ات به {preferred_topic}، این تحلیل جدید برای سطح {academy_level} مناسب‌تر است.` |

Required notification variables:

| Variable | Purpose |
| --- | --- |
| `user_first_name` | Personal greeting when appropriate |
| `academy_level` | Match message depth to user knowledge |
| `next_lesson_title` | Drive learning continuation |
| `weak_topic` | Personalize remediation |
| `arena_risk_score` | Trigger risk discipline coaching |
| `rank_scope` | Distinguish monthly vs all-time ranking |
| `rank_position` | Show user position |
| `rank_delta` | Show movement since last period |
| `points_to_next_milestone` | Create accurate near-goal motivation |
| `certificate_status` | Guide identity/certificate completion |
| `preferred_topics` | Personalize news, coin, and tool updates |
| `local_send_time` | Respect timezone and quiet hours |

Notification evidence requirements:

- Source event recorded.
- Personalization variables recorded or derivable.
- Delivery channel recorded.
- User preference and consent checked.
- Frequency cap checked.
- Message template version recorded.
- Outcome tracked, such as opened, clicked, dismissed, completed, muted, or unsubscribed.
- Safety classification recorded for trading, market, and financial-content notifications.
- Regression tests or scenario tests prove that the notification sends when it should, stays silent when it should, and routes the user to the correct next action.

## 9. Admin Control Principle

Every important platform behavior must have an admin visibility and control path.

Admin panel coverage must include:

- Ranking configuration and anti-cheat review
- Certificate identity review states
- Certificate issuance/revocation
- Smart notification templates, rules, segments, frequency caps, delivery logs, and safety approvals
- OAuth/auth provider configuration
- Content automation sources and publishing rules
- News/tool/coin tagging controls
- Mentor orchestration policies
- Academy and Arena scoring policies
- Exchange entry states and capability gates
- User security and support actions
- Audit logs and evidence registers

## 10. C-Level Ownership Matrix

| Role | Primary responsibility | Required outcomes |
| --- | --- | --- |
| CEO | Product truth, market positioning, launch decision, user trust | No launch claim without evidence; all product surfaces aligned with TecPey vision |
| CPO | User journey, dashboard, profile, ranking, notifications, Academy/Arena/Mentor cohesion | Product Surface Inventory maintained; every user has a clear next action and relevant next notification |
| CTO | Architecture, backend contracts, data persistence, scalability, notification delivery architecture | Server-side source of truth; APIs, event bus, queues, templates, and workflows support all product states |
| CISO | Security, privacy, identity data, access control, audit logs, notification consent | Passport/ID handling encrypted, masked, consented, logged, and least-privilege; sensitive notifications protected |
| COO | Operational readiness, support workflows, certificate operations, notification operations | Admin workflows, support playbooks, certificate review, revocation paths, and delivery incident handling |
| CMO/CGO | SEO, AEO, GEO, content growth, acquisition funnels, lifecycle notification strategy | Public and automated content is discoverable, structured, canonical, measurable, and re-engagement-ready |
| Chief Learning Officer | Academy quality, assessment integrity, certificate credibility | Courses, exams, rankings, certificates, and learning paths are pedagogically valid |
| Chief Trading/Risk Officer | Arena scoring, risk discipline, market education, anti-gambling safeguards, trading-related notification safety | Arena rewards skill, risk management, and learning instead of reckless behavior; notifications never promote reckless trades |
| Chief AI Officer | Mentor orchestration, AI safety, personalization, automation quality, intelligent notification reasoning | Mentor and notification systems guide users with traceable, safe, role-bounded, evidence-aware behavior |
| Head of Design | UI/UX quality, mobile and desktop craft, accessibility, brand coherence | Persian-first, trust-first, blue/cyan TecPey identity with non-template execution |
| Head of QA | Evidence, tests, regression control, launch gates, notification QA | Surface-level QA matrix, acceptance tests, accessibility checks, notification delivery tests, and no-go tracking |

## 11. Acceptance Criteria for Future PRs

Any PR touching dashboard, profile, certificates, rankings, Academy, Arena, Mentor, smart notifications, news, tools, coins, or admin must state:

- Which product surface is affected
- Which C-level owner is accountable
- Which user state is improved
- Which mobile and desktop states were considered
- Which security/privacy risks exist
- Which SEO/AEO/GEO requirements apply
- Which notification trigger, user segment, template, frequency cap, and opt-out/preference control applies
- How notification correctness, personalization, safety, and outcome measurement were verified
- Which admin control exists or is intentionally deferred
- Which tests or evidence prove the change

## 12. Immediate Backlog Items

- Create Product Surface Inventory document.
- Add User Home Ranking specification.
- Add Verified Certificate Identity Profile specification.
- Add ranking anti-cheat and scoring model specification.
- Add certificate privacy and public verification specification.
- Add dashboard mobile/desktop UX acceptance checklist.
- Add content automation SEO/AEO/GEO enforcement checklist.
- Add Smart Notification and Personalized Lifecycle Messaging specification.
- Add notification template taxonomy for Academy, Arena, Mentor, certificates, security, ranking, news, coins, and tools.
- Add notification consent, quiet hours, frequency cap, and unsubscribe/preference policy.
- Add notification analytics and outcome tracking contract.
- Add Smart Notification Engine launch gate with scenario tests for send, suppress, personalize, route, measure, and safety-review behavior.
- Add notification experimentation policy for A/B tests, holdout groups, winning criteria, and rollback.
- Add C-level ownership fields to issue and PR templates.
- Add admin control coverage checklist for every major capability.

## 13. Non-Negotiables

- Do not expose sensitive identity data publicly.
- Do not treat localStorage as source of truth for product-critical data.
- Do not mark a feature complete without mobile, desktop, state, security, and evidence review.
- Do not publish automated content without canonical, structured, tagged, source-linked metadata.
- Do not claim global-grade certificates unless identity, certificate ID, QR verification, and revocation paths exist.
- Do not let ranking reward reckless trading behavior.
- Do not send personalized notifications without consent, preference controls, frequency caps, and auditability.
- Do not use notification hooks that promise profit, induce panic, or push reckless trading behavior. Enforced at two layers from one shared pattern source (`src/lib/notifications/copy-safety-patterns.json`): at CI/`release:check` time `scripts/check-notification-copy-safety.mjs` (`npm run notifications:copy-safety:check`) scans the notification engine and re-engagement "brain" copy, and at runtime `assertSafeNotificationCopy` fails closed at the single governed creation boundary so copy assembled from event payload fields is also rejected. Forbidden categories: profit-promise, FOMO/panic, buy/sell-signal and gambling language.
- Do not consider any major user journey complete unless its smart notification lifecycle is defined, tested, measurable, and safe.
- Do not ship notification changes without a clear trigger, suppression rule, personalization contract, destination route, and outcome metric.
- Do not let admin-critical behavior exist without admin visibility or auditability.
