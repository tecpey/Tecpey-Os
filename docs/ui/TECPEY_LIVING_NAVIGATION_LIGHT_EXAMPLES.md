# TecPey Living Navigation Light Examples

Status: UI motion design examples
Parent pattern: `TECPEY_LIVING_NAVIGATION_LIGHT_PATTERN.md`
Source interpretation: extracted from a moving active-tab light reference and translated into TecPey's Persian-first, trust-first product language

## 1. Example A: Mobile User Home Bottom Navigation

Use case:

Authenticated mobile user after login.

Navigation items:

| Position | Label | Product meaning |
| --- | --- | --- |
| 1 | خانه | User command center and next best action |
| 2 | آکادمی | Learning path and next lesson |
| 3 | آرنا | Practice, challenge, replay, and journal |
| 4 | بازار | Market board, news, coins, and tools |
| 5 | حساب | Profile, identity, certificate, security |

Motion behavior:

- A single cyan active halo moves horizontally between nav items.
- The active icon brightens first, then the label reaches full opacity.
- The halo has a soft inner ring and a weaker outer glow.
- When the user taps fast between items, the halo retargets immediately instead of queuing animations.
- If the target route is loading, the halo moves but the active label enters a pending state until route confirmation.

Recommended visual tokens:

| Token | Value |
| --- | --- |
| Bar background | `rgba(5, 13, 25, 0.82)` |
| Bar border | `rgba(125, 211, 252, 0.16)` |
| Active halo | `rgba(34, 211, 238, 0.90)` |
| Outer glow | `rgba(56, 189, 248, 0.28)` |
| Inactive icon | `rgba(226, 232, 240, 0.54)` |
| Active icon | `#e0faff` |
| Active label | `#a5f3fc` |
| Radius | `24px-28px` |

Timing:

- Halo movement: `220ms cubic-bezier(0.23, 1, 0.32, 1)`
- Icon opacity: `140ms ease-out`
- Label opacity/translate: `160ms ease-out`
- Press feedback: `transform: scale(0.97)` for `100ms-140ms`

Reduced motion:

- No traveling halo.
- Active item changes color instantly or with a `120ms` opacity transition.

Acceptance:

- User can always identify the current section without motion.
- No mobile safe-area overlap.
- Persian labels never clip.
- The exchange entry label remains unchanged wherever it appears: `ورود به صرافی`.

Premium polish details:

- The active halo must be physically centered on the icon, not the text label.
- The label can brighten after the halo starts moving, creating a subtle "arrive then confirm" feel.
- The bottom bar should feel like a single stable object; individual nav items should not jump or resize.
- The active tab can show a tiny top reflection, but only if it stays below text readability thresholds.
- On slow devices, the interaction should degrade to a crisp active color change rather than a choppy light trail.

## 2. Example B: Desktop Dashboard Sidebar Active Rail

Use case:

Authenticated desktop dashboard and admin-adjacent user surfaces.

Navigation items:

| Section | Label |
| --- | --- |
| Dashboard | داشبورد |
| Academy | آکادمی |
| Arena | آرنا |
| Mentor | منتور |
| Market | مارکت برد |
| News | اخبار |
| Tools | ابزارها |
| Profile | پروفایل |
| Settings | تنظیمات |

Motion behavior:

- A narrow cyan rail moves vertically to the active sidebar item.
- The active row receives a calm background tint.
- The active icon gets a tiny leading glow; the row itself should not become a large floating card.
- Hover state is restrained and only enabled on pointer/fine devices.
- For admin and dense operational pages, only the active rail is used. No large halo.

Recommended visual tokens:

| Token | Value |
| --- | --- |
| Sidebar background | `#06111f` or existing TecPey dark surface |
| Active row background | `rgba(14, 165, 233, 0.10)` |
| Active rail | `linear-gradient(180deg, #38bdf8, #22d3ee)` |
| Active text | `#e0faff` |
| Inactive text | `rgba(226, 232, 240, 0.68)` |
| Hover row | `rgba(148, 163, 184, 0.08)` |
| Rail width | `3px-4px` |
| Row radius | `8px` |

Timing:

- Rail movement: `180ms-220ms cubic-bezier(0.32, 0.72, 0, 1)`
- Row tint: `140ms ease-out`
- Icon glow: `140ms ease-out`

Reduced motion:

- Rail jumps to active row with no vertical travel.
- Background tint and text color can still fade quickly.

Acceptance:

- Dense dashboard readability is not reduced.
- Financial numbers, risk warnings, and security notices remain visually dominant when needed.
- The active sidebar item is clear for keyboard users.
- The pattern does not create decorative cards inside the sidebar.

Premium polish details:

- The active rail should move as one continuous object between rows.
- Text should not become overly bright; icon, rail, and background tint carry the active state together.
- The sidebar should still feel enterprise-grade in dense screens.
- Hover and active states must not compete. Active wins.
- Collapsed sidebar state must retain the rail or icon glow without requiring visible labels.

## 3. Example C: Mentor and Smart Notification Pulse

Use case:

Smart Notification Engine and Mentor AI surfaces where TecPey needs to feel attentive and alive.

Trigger examples:

| Trigger | Message intent |
| --- | --- |
| New mentor guidance | The user has a personalized next best action |
| Academy weak topic detected | The user should review a targeted lesson |
| Arena risk issue detected | The user should slow down and practice risk discipline |
| Ranking milestone nearby | The user is close to a meaningful, accurate achievement |
| Certificate profile incomplete | The user can complete identity for certificate readiness |

Motion behavior:

- A short cyan pulse appears around the Mentor avatar, notification icon, or personalized card.
- The pulse runs once when the event arrives.
- The card should not shake, bounce, or repeatedly flash.
- Critical security notifications use explicit alert styling, not decorative pulse.
- Trading-related notifications must never use urgency that pushes risky trading.

Recommended visual tokens:

| Token | Value |
| --- | --- |
| Pulse ring | `rgba(34, 211, 238, 0.48)` |
| Pulse outer | `rgba(14, 165, 233, 0.18)` |
| Mentor active dot | `#22d3ee` |
| Personalized card border | `rgba(125, 211, 252, 0.22)` |
| Card background | `rgba(8, 20, 36, 0.78)` |

Timing:

- Pulse: one cycle, `800ms-950ms ease-out`
- Card border brightening: `180ms ease-out`
- CTA press: `100ms-140ms`

Voice coupling:

Each motion event must be paired with a useful message. Motion without meaning is not allowed.

Good examples:

| Context | Copy |
| --- | --- |
| Academy | `فقط یک درس تا فعال شدن آزمون سطح بعدی فاصله داری.` |
| Arena risk | `در تمرین امروز، ورودهای عجولانه بیشترین اثر منفی را روی امتیازت داشت.` |
| Ranking | `رتبه ماهانه‌ات ۱۲ پله بهتر شده؛ فقط ۲ امتیاز تا milestone بعدی مانده.` |
| Certificate | `برای آماده شدن گواهی، فقط تکمیل هویت رسمی باقی مانده است.` |

Unsafe examples:

| Unsafe copy | Reason |
| --- | --- |
| `الان وارد شو تا سود نکنی جا می‌مونی` | Profit/FOMO pressure |
| `بازار همین الان منفجر می‌شود` | Fear-based market urgency |
| `با این سیگنال رتبه‌ات را بترکون` | Trading signal/gambling tone |

Reduced motion:

- Pulse is replaced by a static unread/personalized badge.
- The message and CTA remain fully visible.

Acceptance:

- Every pulse has a real event behind it.
- Every event has a destination route.
- Every message has a measurable outcome.
- Frequency cap and user preference checks are enforced.
- The experience feels like a mentor, not a marketing blast.

Premium polish details:

- Pulse strength should reflect importance: mentor guidance is calm, ranking near-milestone is lighter, security uses explicit alert UI.
- The pulse should never loop until clicked. One event, one pulse.
- If multiple notifications arrive, they should stack by priority rather than pulsing all at once.
- Motion and copy must agree: a calm coaching message should not use urgent motion.
- The notification should explain itself when the trigger is not obvious, for example: `بر اساس ژورنال آرنای این هفته...`

## Implementation Priority

Recommended order:

1. Mobile user home bottom navigation.
2. Dashboard desktop sidebar active rail.
3. Mentor and Smart Notification pulse.

Reason:

- Mobile bottom nav has the highest daily repetition and strongest perception impact.
- Desktop sidebar gives the platform an enterprise-grade command-center feel.
- Mentor/notification pulse connects the visual language to TecPey's personalized automation engine.
