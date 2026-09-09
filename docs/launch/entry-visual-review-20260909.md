# Entry visual review — 2026-09-09

Evidence: PR #621, commit `f55ac1194880a9b95c3c35d94e1b6d5a78491ae9`,
[browser report](https://github.com/tecpey/Tecpey-Os/actions/runs/34334163722/artifacts/10097168385).
Reviewed all 24 named entry captures: landing/login/signup, light/dark,
Chromium FA mobile + EN desktop and Firefox FA desktop + EN mobile.
These are existing exact-commit CI captures, explicitly selected for this review;
this is not a new live-browser audit or a Safari acceptance run.

| Step | Before | Correction | Why / status |
| --- | --- | --- | --- |
| 1. Landing | FA fixed learning actions lie behind shared mobile navigation; EN adds a second fixed action row over the hero image | Keep both learning links in normal document flow; shared navigation retains the fixed bottom edge | Stops competing overlays; needs fresh browser evidence |
| 2. Login | Both mobile locales show visibly pixelated artwork; desktop is sharp | Replace the obsolete mobile `sizes=1px` hint with the displayed mobile width and a 540px desktop slot | Browser selected an undersized image; fresh resolution assertion added |
| 3. Signup | Same mobile image defect; form labels and primary action are otherwise readable | Use the shared auth image fix; capture a separate form viewport after scrolling to the first field | Full-page captures pin fixed navigation at its viewport location and do not prove field obstruction during scrolling |

## Observed strengths and limits

- Shared hero has clear Academy-first/Mentor-second actions in both languages.
- Desktop auth presents the form beside the introduction with visible field
  labels, selected Login/Signup state, password reveal and account boundaries.
- Mobile login and signup place a long introduction before the form. This is a
  remaining conversion-polish opportunity, not evidence of a broken login.
- English desktop header wraps some labels; readable at the captured 1440px,
  but tablet/intermediate-width review remains outstanding.
- Some light full-page captures have incomplete footer content. Do not use
  those portions as footer acceptance evidence.
- All eight original CI workflows passed. Screenshot review still identified
  the image-resolution and duplicate-fixed-action defects above.
- This evidence does not validate live SMS, authenticated sessions, soft-keyboard
  behavior, Safari/PWA, 200% text zoom or complete accessibility compliance.

## Previous PR

PR #620 is Bitycle market intelligence, not a superseded entry-design PR. At
head `9116d2e28e5448254f487a62cc17d69cb12b3a08` it has 30 changed files,
70 commits ahead and zero behind main `3b64d427f74f160717119091dcbd82314a82466e`.
Its feature changes are not included in #621. Its body still describes an old
base-sync blocker; the actual compare is current. Real provider credentials,
supported local symbols and widget whitelist evidence remain separately gated.
Do not close it as superseded. Complete the Bitycle review and integration
before treating it as finished; clarify the PR number if another PR was intended.

No merge or deploy was performed during this review.
