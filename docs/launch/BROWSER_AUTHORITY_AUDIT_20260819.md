# Browser-Owned Authority Audit — 2026-08-19

**No-Go rule addressed:** _"a launch-critical user state still depends on
browser-only authority"_
(`docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md`).

**Scope:** every durable browser-persistence use in `src/` (excluding tests).
**Method:** enumerate every persistence site, classify each by whether the
browser copy is the source of truth, and enforce the classification in CI so it
cannot drift. The guard is `scripts/check-browser-persistence.mjs`; its
enforcement is proven load-bearing by
`scripts/browser-persistence-authority-policy.test.mjs`
(`npm run test:browser-persistence`).

## Finding

No launch-critical user state depends on browser-only authority. Every
persisting production file holds one of three non-authoritative kinds of data,
and every canonical record is server-authoritative.

### Durable-persistence inventory (7 production files, 25 lines)

| File | Lines | Classification | Why the browser copy is not authoritative |
| --- | --- | --- | --- |
| `src/app/api/ai-mentor-v2/route.ts` | 1 | one-shot-legacy-migration | A comment describing a legacy client that read old `localStorage` and posted it to a stateless endpoint; no live persistence. |
| `src/components/academy/AcademyEngagementHub.tsx` | 2 | disposable-ui-cache | UI engagement state under `tecpey-academy-engagement-v1`, rebuilt from server data on load. |
| `src/components/academy/AcademyMentorCoachCenter.tsx` | 5 | disposable-ui-cache | **Reads only** of `tecpey-academy-term-*` / lesson / quiz / `tecpey-ai-mentor-memory` to seed UI hints; canonical progress is `academy_term_progress` / `learning_events`. |
| `src/components/academy/AcademySimulationWorld.tsx` | 2 | disposable-ui-cache | Local simulation scratch state under `tecpey-academy-simulation-world-v1`. |
| `src/components/academy/AiMentorExperience.tsx` | 6 | disposable-ui-cache | Disposable practice hints and last-12 local memory; the live `/api/ai-mentor` call plus the core `toLocalReply` fail-closed fallback are authoritative. |
| `src/components/academy/GlobalAiMentorWidget.tsx` | 8 | disposable-ui-cache | Includes a one-shot Phase-8 migration that imports old browser chat history **into the server DB**, sets a migration flag, and best-effort removes the local keys — a browser→server drain, the correct direction. |
| `src/components/offline/OfflineSyncManager.tsx` | 1 | repairable-offline-projection | Returns the `localStorage` handle for an offline queue the server can reconcile/repair. |

### Server-authoritative surfaces (persistence forbidden — 0 lines)

The Community journal, current-challenge and finalized-history surfaces are the
places a browser cache would be most tempting and most dangerous. All ten are
verified persistence-free and are pinned in the guard's
`serverAuthoritativeSurfaces` set, so any future persistence on them fails CI:
`api/community/profile/route.ts`, `PeerJournals.tsx`,
`community-journal-client.ts`, `ChallengeCenter.tsx`, `community-challenges.ts`,
`community-journal-challenge-client.ts`,
`community-journal-challenge-authority.ts`,
`community-journal-challenge-finalization.ts`,
`community-journal-challenge-history-client.ts`,
`FinalizedChallengeHistoryCard.tsx`.

### Retired browser-authority modules

The former `trading-arena.ts` / `trading-journal.ts` browser-owned account,
trade and journal authority (and their only consumers) were deleted once proven
unreachable. The `quarantined-legacy-authority` classification is refused
outright, so that authority cannot be reintroduced by a quiet import.

## Drift closures shipped in this audit

The guard already blocked unclassified persistence, count drift, and persistence
on the protected surfaces. This audit closed two remaining ways the invariant
could erode:

1. **Classification allowlist.** A persisting file must now carry a
   classification from a fixed disposable set
   (`one-shot-legacy-migration`, `disposable-ui-cache`,
   `repairable-offline-projection`). Previously any non-empty string passed, so a
   file could legalise persistence by *declaring itself authoritative*. A tag
   outside the set — anything implying browser-owned authority — is now refused.
2. **Cookie / `window.name` write detection.** `document.cookie = …` and
   `window.name = …` are durable browser-authority vectors that the
   Storage/Cache pattern did not see. They are now counted as persistence
   (writes only; reading a server-set cookie is not). The tree currently uses
   neither, so this is pure defense-in-depth against a future write.

Both closures are proven load-bearing: reverting either makes the corresponding
policy test fail.

## Verdict

The browser-only-authority No-Go condition is **satisfied** for the launch
candidate: no canonical user state lives in browser-only storage, and the CI
guard now enforces that property against drift rather than relying on review.
