# TecPey Mentor Standing Pose Assets V1

**Status:** production static fallbacks; not evidence of Rive acceptance

## Runtime assets

| Asset | Purpose | Dimensions | Alpha |
|---|---|---:|---|
| `public/images/mentor/tecpey-mentor-standing-user-v1.webp` | listening, explaining and news briefing toward the user | 768 × 1152 | genuine |
| `public/images/mentor/tecpey-mentor-standing-arena-v1.webp` | challenge invitation and coaching toward the physical-right Arena | 768 × 1152 | genuine |

The two assets preserve the same navy wardrobe, restrained cyan collar, body
proportions and facial identity. The Arena pose uses an open-palm guidance
gesture rather than an accusatory point, trading celebration or urgency cue.

## Identity invariants

- short textured black hair;
- strong straight dark eyebrows and dark almond eyes;
- balanced medium-width face and short controlled beard;
- smooth, narrow and uninterrupted nasal bridge;
- no hump and no broad raised upper dorsum;
- compact base, controlled nostrils and subtly upturned refined tip;
- no claim that the real person is speaking, living again or being simulated.

The original generated RGB files contained a baked checkerboard despite the
transparent-background instruction. As with the approved seated office asset,
they were not consumed directly. Deterministic connected-background alpha
extraction was performed, then each result was reviewed on the dark office
background before conversion to lossless transparent WebP.

## Runtime limits

These are discrete static poses. The 180 ms opacity entrance communicates a
bounded mode change; it is disabled for reduced motion. They must not be
warped, face-morphed or used as lip-sync source material. Continuous turning,
weight transfer, gaze interpolation and mesh-based expression remain blocked
until the signed Rive gate passes.

## Final prompt set

Generation used the built-in image generation path. The shared identity block
for both poses was:

```text
Respectful fictional TecPey mentor inspired by Mehdi; preserve the approved
model-sheet identity. Adult Iranian man, short neatly textured black hair,
strong straight dark eyebrows, dark almond eyes, balanced medium-width face and
short controlled beard. Identity-critical nose: slim, smooth and uninterrupted
bridge; absolutely no hump and no broad raised upper dorsum; compact refined
base; small controlled nostrils; subtly upturned elegant tip, never drooping,
hooked, bulbous or wide. High-end semi-realistic painterly product illustration
matching the existing office cutout. Dark navy fitted crew-neck long-sleeve top
and trousers with a very thin cyan collar accent; no logo or text. Genuine
transparent background, clean edges, correct five-finger anatomy, no props,
room, desk, monitor, watermark or theatrical trading gesture.
```

User-facing pose addition:

```text
Full figure from head through upper thighs, standing at a calm three-quarter
angle toward the viewer, shoulders open, one restrained explanatory open-hand
gesture and the other hand relaxed. Warm mild smile; trustworthy and
professional; generous transparent padding.
```

Arena-facing pose addition:

```text
The exact same character, age, face, body, wardrobe and rendering. Stand in a
right-facing three-quarter profile toward a Trading Arena panel physically to
the viewer's right; head turns back enough for recognition; right hand uses a
precise open-palm coaching gesture and left hand stays relaxed. Focused, calm,
encouraging closed-mouth expression; no pointing, alarm, profit celebration or
urgency.
```
