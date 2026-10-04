# News archive v2 — reading and recovery slice

## User job

Read a selected day's news, identify its original source, filter the archive and recover from an unavailable date without silently substituting another day.

| Before | After | Why |
| --- | --- | --- |
| Introductory copy exposed publication/ranking implementation terms. | A daily market journal explains what the reader can find and where the original report is. | User copy should support reading decisions. |
| Body copy and headings shared heavy weight; badges used 10–11px text. | Regular reading text, 800-weight headings, 12px metadata and a 65ch reading measure. | Create hierarchy and improve sustained reading. |
| Search had only a placeholder and there was no combined filter reset. | Persistent accessible search name and an explicit search/filter reset with URL reconciliation. | Keyboard and assistive users need identifiable controls and a recovery path. |
| Failed date requests ended silently; a mismatched payload could replace the requested day. | Visible localized loading/error/retry states; mismatched day responses are rejected and the old date/items/URL remain. | The interface must distinguish failed retrieval from an empty archive. |
| Active filters used white text on a bright cyan fill. | Active filters use slate-950 text on the same brand fill; the browser case captures a selected filter. | Improve active-state legibility in both themes. |
| Small filter/read/source targets and suppressed select focus. | 44px targets, visible focus, scroll clearance, forced-colors and reduced-motion handling. | Improve pointer and keyboard access without changing content authority. |

Source/time presentation uses bidi isolation and machine-readable publication time. No new provider, dependency, ranking, clustering, freshness certification or publishing permission is introduced. The API response remains the governed presentation boundary; this delta rejects mismatched days, not every possible malformed item.

## Verification scope

Scoped ESLint and TypeScript checks; the browser regression runs in all four existing Chromium/Firefox FA/EN projects at 320px with reduced motion. It covers HTTP failure, a mismatched-day response, unchanged heading/date/URL, keyboard retry, successful recovery, filter clearing, target size, overflow and runtime errors. Browser evidence and screenshots are pending exact-head CI until collected.

No local product screenshot has yet been accepted. Do not infer visual conformance from compilation or this review table.

## Remaining #709 contract

Full headline discovery acceptance (including physical touch/Safari), archive revision/correction timestamp lineage, source-specific stale market handling, cluster/correction lineage, complete negative tests, physical Safari/RTL evidence and independent review remain open. The public feed publication guard below covers a bounded part of latest-first authority. This is not completion of the full News & Market Intelligence contract. No merge/deploy or release approval is granted.

Primary references: https://www.w3.org/WAI/tutorials/carousels/ and https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum and https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum. The initial reading/recovery slice had no horizontal discovery; the later implementation is scoped below.

## Integration

Main `96b56d0e469b356ccf8ee698c5a75a36d1cabe60` is integrated without modifying its application authority. The three accepted-risk records are carried byte-for-byte from `ce8057b2af0c4e90dbf354b6e2331afc8939be98`, preserving approved provenance, October 9/14 review dates and open operational NO-GO boundaries. This does not create a new sign-off.


## Headline discovery and reading return

| Before | After | Why |
| --- | --- | --- |
| Finding a story required scanning the full vertical archive. | A native horizontal headline list previews the first 12 filtered stories, retaining server order, source and publication time. The visible count discloses the bounded preview and the complete archive remains below. | Offer fast discovery without inventing ranking or hiding the archive. |
| There was no before/after card navigation or reading return anchor. | 44px previous/next controls, logical RTL arrow keys, Home/End and normal Tab reveal the focused card. Reading transfers focus to the matching story heading; returning restores the same headline card. | Provide a keyboard/pointer alternative to native scrolling and preserve the reading context. |
| A horizontal strip could depend on browser-specific RTL scroll offsets. | Card centering uses physical bounding rectangles; symmetric edge spacers allow the first and last cards to center on phone and desktop. Native scrolling updates the displayed position. | Keep RTL/LTR behavior consistent without assuming a scrollLeft sign convention. |

The initial headline-only slice used an ordinary labelled navigation/list with native buttons and no automatic rotation, timer, gesture interceptor, synthetic carousel role, animation or additional image request. The rich-card slice below adds governed media and a publication-age clock, retaining user-controlled navigation. Status identifies the current headline; previous/next retains control focus, and only explicit reading changes vertical focus. The 12-item preview is a presentation bound, not a source-quality or popularity policy. Filtering/removing the list resets its local position; no story read/saved state is claimed or persisted.

The new four-project browser case covers 320px and 1280px, reduced motion, boundary controls, focus containment in the horizontal viewport, RTL keyboard directions, Home/End/Tab, explicit read/return, native horizontal wheel scrolling, source-to-story identity, overflow and runtime errors. Native touch/Safari behavior and physical-device acceptance remain open. Fresh candidate-bound CI and manual screenshot acceptance are required.

Primary reference: https://www.w3.org/WAI/ARIA/apg/patterns/carousel/ — user-controlled navigation and predictable keyboard/focus behavior inform this implementation; its ordinary list semantics do not claim the hidden-slide APG carousel pattern.

## Public feed publication-time authority

The API's legacy `isBreaking` field previously clamped negative age to zero, allowing a future timestamp to receive the recent-publication badge. The new `published-at-desc-v1` policy excludes future/invalid publication from downstream `items`, quiz and automation preview, sorts eligible items by publication instant descending, and resolves equal instants by article URL then archive ID using locale-independent string order. Publication at the request's observation instant is eligible; one millisecond in the future is not. The existing inclusive 12-hour badge window is retained, with no ingestion-time substitution or invented significance authority.

Archive presentation/evidence remains intact, including pending Persian rows. Translation eligibility still applies before the publication guard. `publicationWithheldCount` discloses the guard's excluded downstream count and `publicationPolicy` names the policy; neither changes source rights. An empty eligible feed uses `fallback` even if the archive retains pending or withheld items. The legacy `live` mode is not a source freshness SLA and still requires the remaining freshness work. Historical publication remains eligible on historical archive requests without being called recent. No retention, dedupe, provider, DB schema, correction lineage or market-price freshness policy is changed.

Behavior tests cover conflicting fetched/modified/event timestamps, immutable input, same-day future and invalid times, invalid observation clock, exact window boundaries, stable ties under shuffled arrival and equivalent timezone instants. The public DB-only route tests and no-loss/media regression remain required. These tests do not prove provider provenance, article revision selection or full freshness acceptance.

Primary research: https://developers.google.com/search/docs/appearance/publication-dates (accessed 2026-10-03) distinguishes publication/update from event dates, discourages future publication dates and requires consistent visible/structured values. The feed ordering and 12-hour badge boundary are TecPey policy, not a Google ranking prescription.

## Public market response freshness and cache boundary

Public price rows were validated during normalization, but could expire while an upstream companion response was processed or survive in the HTTP cache beyond their source freshness limit. The public market response now rechecks known-provider rows immediately before presentation. CoinGecko retains the existing 5-minute limit; Bitycle retains the existing 2-minute frame limit and both retain the existing 30-second source-clock tolerance. The row-level authority timestamp and nested price timestamp must identify the same instant. Unknown providers and missing/invalid/conflicting timestamps fail closed.

Shared-cache lifetime is the minimum remaining upstream validity across returned rows, capped at the existing nominal 60 seconds for CoinGecko or 10 seconds for Bitycle, rounded down to whole seconds. Less than one second of validity, empty results or invalid authority use `no-store`. Otherwise `max-age=0`, bounded `s-maxage` and `must-revalidate` require revalidation when stale; public prices no longer opt into stale-while-revalidate. Expired Bitycle rows use the existing CoinGecko fallback; expired matched-search prices are unavailable rather than a fabricated successful empty price result. Genuine empty searches remain successful.

Four policy cases and four route cases cover mixed-provider expiry, cache lifetime from the oldest row, exact age/skew boundaries, malformed authority, invalid clock, near-expiry/no-store CoinGecko responses, stale matched searches, Bitycle cache limits and expiry while a companion response is processed. Route fixtures exercise GET with controlled provider HTTP responses and clock; they do not query live providers or prove deployed CDN behavior.

Scope is the public market-list origin response and its cache directives. The origin-only slice left already-rendered client prices and market-row recovery open; the client slice below now covers the two market-list pages. Iranian comparison/other endpoints, actual CDN override validation and complete source-specific freshness acceptance remain open. No market-data, trading, funds or release authority is granted.

Primary references (accessed 2026-10-03): RFC 9111 sections 5.2.2.2 and 5.2.2.10, https://www.rfc-editor.org/rfc/rfc9111.html, specify revalidation and shared-cache lifetime; https://docs.coingecko.com/reference/coins-markets documents the upstream timestamp field. Source thresholds are existing TecPey policy, not provider guarantees.

### Open-page market validity and recovery

| Before | After | Why |
| --- | --- | --- |
| Cached prices could remain visible beyond the source validity window. | Both market locales check the existing provider/timestamp policy every second and immediately on focus or visibility changes. Expired or unverifiable prices, movement and dependent charts are masked; asset identity remains. | Fetching a cached snapshot does not renew upstream data age. |
| Failed fetches could replace the board with an ambiguous empty result. | Failed acquisition becomes a query error, preserving the previous asset list and offering a keyboard-accessible 44px refresh control with an explicit recovery message. | Readers retain context and a direct recovery action. |
| Fetching was a transparent interaction-blocking overlay in Persian. | A shared bilingual status panel communicates validity and retrieval; refresh retains focus. | State must remain visible and actionable. |
| Manual screenshot review found the left floating mentor launcher covering the English mobile refresh target. | The refresh control stays on the physical right in both locales; browser hit-testing verifies its corners and center are unobscured. | The complete 44px recovery target must remain actionable. |
| Persian prices used a fixed USDT header even for CoinGecko USD data; English formatted every quote as dollars. | Provider-normalized USD and USDT units are displayed distinctly per row in both locales. USD rows do not use the USDT/IRT conversion rate. | USD and USDT are distinct quote assets; freshness does not imply convertibility. |
| Provenance could substitute observation time for source time. | The label uses only the upstream timestamp, rendered deterministically in Asia/Tehran. | Observation is not price publication authority. |

The external-store clock starts from a deterministic unknown server snapshot; values become eligible after client subscription. Its single shared timer is removed when subscribers leave. Visible pages request updates every 30 seconds and on focus; retries are explicit, with no background polling. The one-second check is not a guarantee of zero-latency expiry or accurate device time. Existing server cache deadlines remain authoritative. Unknown providers fail closed. IRT conversion-rate freshness, other price surfaces, physical touch, Safari and complete product accessibility remain outside this slice.

Primary implementation references: [React external-store subscriptions and hydration](https://react.dev/reference/react/useSyncExternalStore), [TanStack Query polling and focus options](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery), and [Playwright controlled clock](https://playwright.dev/docs/clock). The browser fixture checks expiry, failed retrieval, keyboard recovery, focus resumption and viewport overflow in both governed browser engines and locales; it is synthetic evidence, not live-provider certification.

## Rich discovery cards and honest media fallback

Design read: TecPey's existing cyan/slate identity, an editorial title-and-summary hierarchy, design variance 3–4, motion 1 and density 4–5. This bounded discovery view uses the existing presentation authority and native scrolling; it introduces no automatic rotation or new media rights.

| Before | After | Why |
| --- | --- | --- |
| Headline previews omitted media and the authorized summary. | Each discovery card reuses governed 16:9 source media or an explicit fallback, source, publication time, authorized `displayLead` and a read action. | Give readers useful context before entering the full archive. |
| A failed image disappeared while its caption still claimed source media. | A shared media component changes both the rendered image and caption to fallback on failure; blocked policies and non-governed URLs never create an image request. Attribution appears only with permitted, non-failed source media. | Failure must not impersonate source imagery or bypass provider policy. |
| A fixed desktop width did not define adjacent-card visibility. | Desktop card width is half the track minus its two gaps, exposing half of each neighboring card around the centered middle card. Mobile retains readable focal width with narrow edge context. | Support visual discovery without shrinking mobile text into an unreadable half-card arrangement. |
| Publication context did not expire in an open tab. | The existing 12-hour publication predicate uses one shared browser clock with deterministic unknown SSR state and focus/visibility resumption. Future timestamps receive an explicit future-time label. | Retrieval time cannot make an older or future publication recent. |

The market clock's compatibility export shares the same subscription store with news. There is no new policy duration, ingestion ranking, editorial translation, generated news imagery, provider or package. `displayLead` remains the server's authorized localized/publisher/metadata-only presentation; the client never reads internal publisher bodies. Clamped title/summary previews retain complete text in the archive and accessible card descriptions. Publication recency does not certify factual accuracy.

Verification: the additional four-project browser case covers successful controlled same-origin media, HTTP failure and fallback, blocked external media, attribution, summary/source/time context, recent/old/future publication, clock expiry despite a newer synthetic fetch timestamp, desktop half-peek geometry, light CSS theme, overflow and runtime errors. It complements the existing RTL keyboard/Home/End/Tab/native-wheel/read-return case. The controlled brand PNG is a test fixture, not a licensed news-photography assertion. Exact-head browser screenshots and CI must be reviewed before acceptance. Physical touch/Safari, full assistive-technology acceptance, arbitrary fixed-chrome focus positions and the remaining intelligence contract remain open.

Primary references: [WAI user-controlled discovery and focus](https://www.w3.org/WAI/tutorials/carousels/), [native CSS scroll snap](https://www.w3.org/TR/css-scroll-snap-1/), [React deterministic external-store hydration](https://react.dev/reference/react/useSyncExternalStore). This is an ordinary navigation/list, not a claim to implement the hidden-slide carousel pattern.

Manual review of candidate `c352d6c` found a narrow-screen fallback caption covering the duplicated source name inside its media placeholder. The corrected component keeps the source in the metadata row, uses only a decorative fallback icon, and does not render placeholder content behind transparent source imagery. Its media caption is included in the card’s accessible description. The 49 browser passes for that earlier candidate are historical; the correction requires its own exact-head CI and visual acceptance.

Candidate `79121c7` passed all 49 browser cases, but visual review found the two-line English fallback caption overlapping its decorative icon at 320px. The corrected mobile icon sits above that caption, with a two-pixel minimum clearance checked in every browser/locale project. Desktop retains centered decorative placement. Current-head CI and images remain the acceptance source.

## Focused-card return and fixed-shell clearance

| Before | After | Why |
| --- | --- | --- |
| Returning from a story scrolled the entire navigation region to its start, then focused a card without vertical reveal. Longer cards could approach fixed mobile chrome. | Keyboard-visible card focus uses native centered scroll with explicit top/bottom scroll margins, then restores horizontal centering using physical geometry. Returning explicitly reveals the matching card, then focuses it. | The user's interaction target, rather than the navigation container, determines the reading return position. |
| The position label started at the inline edge near the floating mentor launcher. | The label is centered; focused-card bottom clearance reserves its space as well as the mobile shell and safe-area inset. | Keep discovery context near its card and away from the corner launcher. |
| The browser case checked horizontal containment but used short summaries. | Longer localized titles/summaries exercise keyboard arrows, Tab and reading return with vertical bounds, five-point card hit-testing and a visible position-label center. No test helper recenters the card. | Verify the application's own focus reveal instead of a screenshot preparation action. |

Previous/next controls retain focus and change only horizontal position. Pointer focus does not introduce vertical movement between pointer down/up; the regression also checks pointer reading and return. This delta adds no animation, gesture interception, persistence or authority. Evidence targets 320×760 and the existing 1280px regression in all four governed browser/locale projects. Shorter visual viewports, physical software keyboards, zoom/reflow extremes, Safari, open persistent overlays and full-product WCAG acceptance remain open. A focused target larger than the available viewport cannot be promised to fit completely. Market provenance and the independent comparison surface are unchanged. Current-head CI and screenshots remain required.

Primary references: [W3C focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) and [CSS scroll margins and scroll-into-view alignment](https://www.w3.org/TR/css-scroll-snap-1/). W3C's AA minimum permits partial visibility; the bounded browser assertion deliberately checks the complete card target within the tested viewport, without claiming product-wide conformance.


## Fetched archive rendering continuity

A successful HTTP response previously committed any `archiveItems` array before validating fields consumed by rendering. An invalid publication instant could throw during `Intl.DateTimeFormat`; malformed taxonomy or body text could also interrupt rendering. The client now checks calendar metadata, consumed string/boolean/link types, taxonomy arrays, finite publication instants and unique archive identities before replacing the displayed day. A malformed batch is rejected as a whole, preserves the current date/stories/URL and uses the existing localized retry alert. It does not silently drop evidence or manufacture replacement timestamps.

Twelve direct tests cover valid/empty batches, malformed dates/text/taxonomy/flags/links, mixed batches, duplicate IDs and future archived publication. The existing four-project recovery case now exercises 503 → mismatched day → invalid publication → valid recovery, checking preserved context and no runtime error. Future archived publication remains admissible evidence and retains the independent recent/publication-eligibility rules.

This checks client-rendered fields of fetched responses, not every backend field, initial server props, publisher authority, URL/source licensing or live provider correctness. Server presentation and media rights remain authoritative. Primary language reference: https://tc39.es/ecma402/#sec-datetime-format-functions (finite date-value requirement); status semantics: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html .
