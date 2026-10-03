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

The rail is an ordinary labelled navigation/list with native buttons. It has no automatic rotation, timer, gesture interceptor, synthetic carousel role, animation or additional image request. Status identifies the current headline; previous/next retains control focus, and only explicit reading changes vertical focus. The 12-item preview is a presentation bound, not a source-quality or popularity policy. Filtering/removing the list resets its local position; no story read/saved state is claimed or persisted.

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

Scope is the public market-list origin response and its cache directives. Already-rendered client prices, React Query cache/polling/visibility handling, market-row degraded UX, Iranian comparison/other endpoints, actual CDN override validation and complete source-specific freshness acceptance remain open. No market-data, trading, funds or release authority is granted.

Primary references (accessed 2026-10-03): RFC 9111 sections 5.2.2.2 and 5.2.2.10, https://www.rfc-editor.org/rfc/rfc9111.html, specify revalidation and shared-cache lifetime; https://docs.coingecko.com/reference/coins-markets documents the upstream timestamp field. Source thresholds are existing TecPey policy, not provider guarantees.
