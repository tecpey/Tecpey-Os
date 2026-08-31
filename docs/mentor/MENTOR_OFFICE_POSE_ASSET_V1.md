# TecPey Mentor Office Pose Asset V1

Status: approved static fallback for the Mentor Workspace office scene. This
asset is not evidence that the governed Rive runtime gate has passed.

## Output

- Runtime asset: `public/images/mentor/tecpey-mentor-office-pose-v1.webp`
- Dimensions: 640 × 583
- Format: WebP with genuine alpha
- Intended placement: seated between the monitor bank and desk, facing the
  monitors at a three-quarter rear angle

## Reference roles

1. The closest approved multi-angle character likeness supplied the primary
   identity and profile.
2. A real profile reference supplied the identity-critical nose anatomy.
3. The approved expression and angle sheet supplied illustration continuity.

The real person is a respectful inspiration for a fictional TecPey mentor. The
asset must never be described or operated as an impersonation, resurrection, or
simulation of that person.

## Final generation prompt

```text
Use case: identity-preserve
Asset type: transparent production fallback character cutout for the TecPey AI Mentor office scene
Input images: Image 1 is the approved closest character likeness and multi-angle reference; Image 2 is a real facial/profile reference for exact nose anatomy; Image 3 is the approved expression and angle sheet for style continuity.
Primary request: Create one clean, isolated seated mentor character pose, viewed from a three-quarter rear angle. He is sitting in an office chair and facing away from the user toward a computer monitor, while turning his head only slightly so a small portion of his right-side profile remains recognizable. This must read immediately as “working at his monitors,” not as a front-facing portrait.
Subject identity: preserve the approved likeness of Mehdi-inspired fictional mentor: short dense black hair, strong dark eyebrows, warm brown eyes only partially visible from the turn, neatly trimmed dark beard, sturdy shoulders. The nose is identity-critical: slim and refined after cosmetic surgery, perfectly smooth bridge with no hump or broad raised section, a gentle continuous slope, compact narrow base, and a subtly upturned elegant tip. Do not lengthen, widen, hook, or hump the nose.
Clothing: simple premium dark navy crew-neck office top with one restrained cyan collar accent; no logo and no text.
Style/medium: polished semi-realistic vector-like digital illustration matching the approved character sheets; clean layered silhouettes, precise edges, restrained texture, premium enterprise product aesthetic, suitable for later vector tracing and Rive rigging.
Composition/framing: entire head, neck, shoulders, upper torso, arms resting naturally forward, and upper office chair visible; centered; no desk, no monitors, no environment; keep generous transparent padding around the silhouette.
Lighting/mood: subtle cool office rim light from the monitors; calm, focused, trustworthy.
Background: genuinely transparent alpha.
Constraints: respectful fictional mentor inspired by the provided person, not a claim of simulation; preserve facial proportions and the identity-critical nose; believable rear-facing working pose; no cropped head or shoulders.
Avoid: front-facing pose, full face toward viewer, nose hump, wide nose bridge, hooked nose, oversized beard, exaggerated muscles, extra limbs or fingers, text, logo, watermark, halo, desk, monitor, background, floor, other people.
```

Generation used the built-in image generation path. The generated RGB file
contained a baked checkerboard despite the transparency instruction, so it was
rejected as a runtime asset. A deterministic alpha extraction was visually
checked over the office background, including enclosed negative space below the
arm and inside the chair, before the optimized WebP was produced.

## Runtime and Rive boundary

- The portrait avatar remains the launcher and message-level fallback.
- This rear pose is used only inside the office scene.
- The Rive asset may replace this image only after the existing signed identity,
  motion, performance, multilingual, and reduced-motion acceptance gates pass.
- The nose silhouette is identity-critical and must not be deformed by a mesh,
  state transition, lip-sync layer, or responsive layout.
