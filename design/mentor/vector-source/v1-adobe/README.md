# Mentor vector authoring source v1

This directory is the first production authoring input for the TecPey Living
Mentor. The files are real editable SVG paths generated from the approved
reference sheets. They are deliberately marked `trace_reference_only`.

## Source authority

- `mentor-identity-primary-four-view.trace.svg` owns likeness and geometry.
- The four cropped identity SVGs make front-to-profile comparison practical
  while rebuilding the clean Rive face.
- `mentor-expression-angle-reference.trace.svg` owns expression intent only.
  It cannot replace the identity geometry or change the nose.
- The character is a respectful fictional identity inspired by Mahdi. It is
  not Mahdi and must never be presented as a continuation or impersonation.

## Why these SVGs do not ship

The Adobe traces contain 13,998 paths and no semantic groups. Direct import as
the runtime character would create an oversized, unriggable asset whose nose,
eyes, mouth, beard, and hair could not be governed independently. A character
artist uses these files as visual/path references and rebuilds the semantic
groups listed in `mentor-vector-source-pack.v1.json` inside `MentorCore`.

`geo_nose_identity` stays rigid and receives zero weight from speech, affect,
jaw, and head-aim deformation. Expressions come from brows, eyelids, cheeks,
mouth corners, jaw, and lips; they never regenerate the nose.

## Honest coverage boundary

The approved sheet supplies front, two right-turn intermediates, and a right
profile. Left three-quarter and left profile evidence remain open acceptance
items. Mirroring is useful as an animation construction aid, but it cannot
close an identity-review gap because real faces are not perfectly symmetric.

## Verification

```bash
npm run mentor:vector:source:check
npm run test:mentor-vector-source
```

The check binds every source to its byte count and SHA-256, rejects embedded
raster/script content, locks the nose contract, and blocks any source entry
that claims a flat trace is production-ready.
