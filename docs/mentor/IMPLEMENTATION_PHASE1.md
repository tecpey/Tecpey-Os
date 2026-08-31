# TecPey Living Mentor — Phase 1 implementation record

> Current Rive Editor progress is recorded in
> [`RIVE_EDITOR_CHECKPOINT_V1.md`](./RIVE_EDITOR_CHECKPOINT_V1.md). Runtime
> activation remains on the safe static fallback until the signed acceptance
> artifact exists.

Status: implemented locally, not deployed
Contract: `tecpey-mentor-rive-viewmodel.v1`

## Product surfaces

| Surface | Current implementation | Runtime policy |
|---|---|---|
| Global launcher | Approved static portrait, semantic open button | Never loads Rive while closed |
| Global mentor panel | Portrait plus host-owned state projection | Static fallback until the signed `.riv` asset exists |
| Dedicated mentor center | Character presence, evidence state and recommended mode | No invented level, weakness or confidence |
| Academy profile | Character entry to the dedicated mentor center | User identity and Mentor identity remain visually distinct |

## Host-to-character boundary

The reusable projector in `src/lib/living-mentor-presentation.ts` passes only a
small presentation vocabulary to the renderer:

- `idle_attentive`
- `listen`
- `think`
- `explain`
- `risk_caution`

Safety has first priority. Profile fields, raw questions, market evidence,
credentials and private user data remain in semantic host UI and do not enter
the character asset.

`src/lib/living-mentor-rive-adapter.ts` now implements the runtime projection
that will sit immediately in front of the future Rive renderer. It:

- emits exactly the manifest's 22 value paths plus the separate `playAct` edge;
- rejects unsupported contract majors and expired snapshots;
- deduplicates `eventId` so an act cannot replay on every React render;
- rejects stale `utteranceId` frames and returns speech to `sil` outside active playback;
- clamps all numeric deformers to their governed ranges;
- overlays device reduced-motion/high-contrast preferences without disabling
  essential lip synchronization;
- cannot emit host-only identity, learning, market, copy, consent, entitlement,
  or provenance fields by construction.

## Global-language readiness

The avatar accepts a BCP-47-compatible locale string and permits a host-provided
accessible label. Its fallback label is Persian for `fa*` and English for other
locales; production translations must come from the product localization layer.
The character image contains no text, flag, script or locale-specific gesture.

The currently routed Mentor product surfaces remain Persian/English. Adding a
new product locale requires localized host copy and speech-profile approval; it
does not require a new character rig.

## Evidence integrity changes

- Removed the fabricated default medium-risk profile.
- Removed the fabricated readiness score and trade-permission prompt.
- Removed local controls that let the browser impersonate a verified level or
  risk profile.
- Removed fallback weak areas, calculated confidence inflation and the default
  one-day streak.
- Unknown or unavailable data is rendered explicitly as unavailable.

## Rive activation gate

The Rive web dependency is intentionally not installed in Phase 1. Activation
requires all of the following:

1. signed `.riv` asset and matching manifest;
2. five-state web/mobile spike accepted at real product sizes;
3. measured bundle, memory and frame-time budgets;
4. reduced-motion, high-contrast and screen-reader acceptance;
5. identity-likeness and legal/brand approval;
6. fallback parity when WebGL, the asset or the network is unavailable.

Until those gates pass, the static portrait is the honest production fallback.

The gate is now enforced in code rather than existing only as prose:

- `docs/mentor/acceptance/tecpey-mentor-rive-acceptance.v1.schema.json`
  defines the evidence contract;
- `docs/mentor/acceptance/tecpey-mentor-rive-acceptance.v1.template.json`
  is the fail-closed handoff packet for the Rive artist and reviewers;
- `npm run mentor:rive:activation:check` permits the current static fallback but
  blocks any Rive dependency or `.riv` activation without accepted evidence;
- `npm run mentor:rive:gate` validates the signed asset, contract hashes,
  identity locks, multilingual coverage, web/mobile parity, performance,
  accessibility, privacy, and executive sign-offs;
- `npm run test:mentor-rive-gate` proves the five-act Spike gate, the 13-act and
  15-anchor Production expansion, and identity/globalization fail-closed rules.

The detailed handoff and evidence rules are in
[`acceptance/README.md`](./acceptance/README.md).

## Verification

- targeted ESLint: pass
- TypeScript `tsc --noEmit`: pass
- Living Mentor presentation tests: pass
- Living Mentor Rive adapter tests (9): pass
- UI authority check: pass
- AI Mentor trust-boundary check: pass
- Academy/Arena/Mentor accessibility evidence check: pass
- Rive activation authority (static-fallback state): pass
- Rive gate policy tests: pass
- Next.js production build: pass

The production build reports the repository's existing local warning that
`DATABASE_URL` is not configured; the build still completes successfully.
