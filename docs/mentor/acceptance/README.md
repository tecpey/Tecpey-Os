# TecPey Living Mentor — Rive Acceptance Gate v1

**Current decision:** `BLOCKED` — the approved static portrait remains the only
production renderer until a signed `.riv` asset and its evidence packet pass
this gate.

This directory is the release authority between the character artist, Rive
animator, web/mobile engineering, and executive reviewers. A convincing demo is
not acceptance. The same canonical asset must prove identity stability, global
speech coverage, safety behavior, accessibility, runtime lifecycle, and measured
performance.

## Release stages

| Stage | Purpose | Required character coverage | Activation result |
|---|---|---|---|
| `spike` | Prove the architecture on real web and mobile product sizes | 5 governed acts, 6 affects, 12 expression references, 5 head angles, 6 stress speech anchors, 9 continuous articulation controls | May activate only the controlled Phase 2 spike |
| `production` | Approve the reusable global rig | 13 governed acts, 8 global poses, all 15 speech anchors, and the complete Spike matrix | May activate the production renderer after all sign-offs remain valid |

The launcher, panel, profile, Academy, and Arena use one `MentorCore`. The
deferred share-video artboard does not block interactive v1 and cannot fork the
character identity.

## Identity lock

The character is a respectful fictional identity **inspired by Mahdi**, not
Mahdi and not a digital continuation of him. The evidence document encodes the
approved nose as immutable geometry:

- a smooth, narrow bridge;
- a continuous, gentle, slightly concave slope;
- no dorsal hump and no broad upper-body swelling;
- a refined, slightly upturned tip;
- stable nostril width across front, three-quarter, and profile references;
- no deformation from expression, speech, head aim, or automated tooling.

The gate also requires human-reviewed regression evidence for the nose, eye
spacing, skull outline, beard boundary, hairline, and silhouette. Pixel diffs
may detect drift; they never replace the memorial-likeness owner's decision.

## Global rig proof

Persian and English are reference locale profiles, not architectural limits.
The visual rig must pass all of these language-independent classes before a
global-readiness sign-off:

- LTR Latin text and RTL connected script;
- mixed-direction financial copy, tickers, names, numbers, and currency;
- CJK text without spaces and Indic complex script;
- locale-tagged code switching at aligned segment boundaries;
- missing-locale failure to captions plus `sil`;
- all localized text, captions, CTA, focus, and semantics outside the canvas.

This gate approves the global rig contract. It does not mark a locale as
product-supported. Every shipped locale still needs its own language owner,
native-listener set, pronunciation lexicon, captions, safety-copy review, and
commercial voice rights.

## Evidence packet

Start from
[`tecpey-mentor-rive-acceptance.v1.template.json`](./tecpey-mentor-rive-acceptance.v1.template.json).
The completed, reviewed packet belongs at:

`docs/mentor/acceptance/accepted/tecpey-mentor-rive-acceptance.v1.json`

Every accepted item must contain at least one durable evidence reference. The
packet records the SHA-256 and byte count of the canonical `.riv` file and the
hashes of all five governing contracts, so an accepted animation cannot be
silently paired with a changed contract.

Evidence must be generated from production builds after a 5-second warmup, for
30 seconds, in three runs. The manifest owns the exact frame-time, FPS, load,
fallback, size, and regression ceilings.

## Commands

```bash
# Always green while the repository honestly uses the static fallback.
# It becomes a hard blocker as soon as a Rive package or .riv asset appears.
npm run mentor:rive:activation:check

# Evaluate the completed signed evidence packet.
npm run mentor:rive:gate

# Test fail-closed behavior and stage expansion.
npm run test:mentor-rive-gate
```

The activation check permits exactly `@rive-app/react-webgl2` in this web
repository, exactly one canonical `.riv` file under `public/`, and an accepted
evidence packet naming that exact file. It also requires the static fallback to
remain available. The mobile package is pinned and proven in the mobile
repository, but its parity evidence is recorded in the same acceptance packet.

## Executive sign-off

The packet cannot reach `accepted` without all required owners from the rig
manifest: Product, Character/Brand, memorial-likeness owner, Learning,
Financial Risk, Globalization, Accessibility, Engineering, Security/Privacy,
and Legal. Safety, truth, learner dignity, and fair assessment remain identical
for Free and Premium plans; monetization cannot waive a gate.

Any change to the character geometry, `.riv` bytes, contract hashes, runtime
version, or required evidence revokes the old acceptance and requires a new
packet.
