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

Horizontal focal-card discovery, latest-first/conflicting-timestamp authority, source-specific stale market handling, cluster/correction lineage, complete negative tests, physical Safari/RTL evidence and independent review remain open. This is an implemented reading/recovery slice, not completion of the full News & Market Intelligence contract. No merge/deploy or release approval is granted.

Primary references: https://www.w3.org/WAI/tutorials/carousels/ and https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum and https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum. Carousel guidance informs the still-open discovery slice; no carousel is claimed in this delta.

## Integration

Main `96b56d0e469b356ccf8ee698c5a75a36d1cabe60` is integrated without modifying its application authority. The three accepted-risk records are carried byte-for-byte from `ce8057b2af0c4e90dbf354b6e2331afc8939be98`, preserving approved provenance, October 9/14 review dates and open operational NO-GO boundaries. This does not create a new sign-off.
