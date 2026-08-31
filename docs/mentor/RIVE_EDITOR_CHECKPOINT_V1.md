# TecPey Living Mentor — Rive Editor Checkpoint v1

**Recorded:** 2026-08-30
**File:** `tecpey-mentor-global.v1`
**Machine checkpoint:** [`design/mentor/rive-authoring/tecpey-mentor-rive-editor-checkpoint.v1.json`](../../design/mentor/rive-authoring/tecpey-mentor-rive-editor-checkpoint.v1.json)

## Accepted editor state

| Artboard | Size | Role | Current state |
|---|---:|---|---|
| `MentorCore` | 1024×1024 | Only reusable runtime core | Component with the accepted nine-node semantic group skeleton; no identity geometry or motion |
| `IdentityReference` | 1536×1024 | Authoring reference only | Non-component; four locked 384×1024 views at x = 0, 384, 768, and 1152 |
| `ExpressionReference` | 1536×1024 | Authoring reference only | Non-component; full expression/angle trace locked at 0,0 |

`IdentityReference` and `ExpressionReference` must never be converted to
components, instanced by a runtime wrapper, or included in an exported
production component. Their only purpose is supervised reconstruction and
identity regression.

## Accepted mechanical skeleton

The following parent/child topology now exists inside `MentorCore`:

- `MentorCore`
  - `grp_shadow`
  - `grp_character`
    - `grp_body_back`
    - `grp_torso`
    - `grp_head`
    - `grp_body_front`
  - `grp_controls`
  - `grp_skeleton`
  - `grp_debug`

The live hierarchy panel displays overlay groups above the character and the
shadow below it, which is the intended visual draw order. The names and
parentage above are the semantic contract; visual stacking is recorded
separately in the machine checkpoint.

Rive currently shows the editor defaults `ViewModel1` and `Instance` on
`MentorCore`. These values are provisional evidence that the core is a
component, not accepted contract names. Runtime integration remains blocked
until the canonical `TecPeyMentorVM` contract is created or bound and verified.

No face, nose, eyes, mouth, beard, hair, body geometry, mesh, bone, weight,
animation, speech deformation, or state behavior was authored in this gate.

## Heavy expression reference

The full traced expression sheet is valid as a source artifact but too complex
for casual editing. Importing its thousands of editable vector paths caused the
browser/WebGL session to recover, but the import completed successfully and is
now locked at 0,0. Do not expand or edit this group during ordinary rig work.
If it continues to destabilize authoring, replace only this non-runtime reference
with a lightweight raster after explicit approval; the production rig itself
must remain native vector geometry.

This does not lower the production bar: the actual face, immutable nose, eyes,
mouth, beard boundary, hairline, meshes, bones, and weights must still be clean
native Rive geometry authored and reviewed by a character artist.

## Locked identity boundary

- respectful fictional identity inspired by Mahdi, never Mahdi or a simulated continuation of him;
- narrow, smooth bridge without an upper hump or broad swelling;
- gently sloped, slightly concave dorsum;
- refined, slightly upturned tip;
- zero speech, affect, jaw, and head-aim deformation weight on the nose;
- motion QA must compare nose bridge, tip rotation, nostril width, eye spacing,
  jawline, beard boundary, hairline, and silhouette at every extreme.

## Next editor gate: contract topology

1. Keep both reference artboards non-components and all reference traces locked.
2. Keep the expression trace collapsed; replace it only if stability requires it.
3. Replace or bind the provisional editor model with the canonical
   `TecPeyMentorVM` schema and verify types, enums, defaults, locale, RTL, and
   reduced-motion behavior.
4. Create `MentorStateMachine` as inspectable empty mechanical topology.
5. Hand-author geometry, mesh, weights, and animation; automated tooling may
   only create inspectable names, groups, bindings, and empty state topology.
6. Do not activate runtime delivery until the signed acceptance evidence passes.

## Motion decision

The launcher is a high-frequency surface and remains static while closed.
Animated Rive loads on intent in the Mentor tab or when a larger Mentor surface
is visible. Motion serves state indication and explanation; it does not animate
financial data, imply live market activity, or add decorative profit hype.
