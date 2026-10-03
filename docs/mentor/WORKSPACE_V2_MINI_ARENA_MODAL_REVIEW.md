# Mentor Workspace v2 — Mini Arena interaction review

Date: 2026-10-03. Reviewed parent: `4528693681342045448953888a4b85413c3a53d7`.
Scope: PR #703 only; no merge, deployment or renderer activation.

## Findings and implementation

| Before | After | Why |
| --- | --- | --- |
| Mobile/tablet section declared `aria-modal` with a document-level Tab handler; background was still interactive. | Native `dialog.showModal()` in the browser top layer; desktop keeps its nonmodal region. | Background pointer, keyboard and accessibility interaction must be inert, including dynamically loaded execution controls. |
| Minimizing removed the focused control without placing focus on the recovery action. | Focus moves to the localized Restore Arena button; restoring reopens native modality. | Keyboard users can recover the panel directly. |
| Safety copy and rule labels used 8–11px text; compact icon controls shrank to 42px. | Body and rule copy use 14px, supporting labels at least 12px, compact controls retain 44px. | Make the learning and safety instructions readable and controls easier to target. |
| Reduced motion shortened transitions but kept active scale transforms; no dock-specific forced-colors policy. | Remove press transforms and transitions under reduced motion; use system colors and visible outlines under forced colors. | Preserve meaning and operability with user accessibility preferences. |

## Primary design basis

- W3C H102, native modal dialogs: https://www.w3.org/WAI/WCAG22/Techniques/html/H102
- W3C APG, modal focus behavior: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- Apple accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility
- Apple motion: https://developer.apple.com/design/human-interface-guidelines/motion
- Installed Next.js guides: `01-app/02-guides/lazy-loading.md` and `01-app/01-getting-started/05-server-and-client-components.md`.

## Browser-discovered correction

The reconciled head `47c9bd753bee75e0fee1dfc607cde17897798a19` passed
Full Suite, API Security Manifest, Secret Scanning, Repository Audit, Sensitive
Mutation Audit and AI Tenant RLS. The new FA and EN 320px test failed precisely
at Tab from the last modal action: Chromium can move focus into browser chrome.
Background-focus rejection and native `:modal` checks had already passed.
A dialog-scoped Tab/Shift+Tab boundary handler now wraps visible, enabled controls;
native modality still owns background inertness. The strengthened test asserts
both exact boundary targets. A fresh exact-head browser run is required.

On `57f8c2eb3deb4e97049db9686a20ca0a44eb25bb`, both boundary focus
assertions passed. The next recovery click revealed the minimized action under
the mobile shell navigation: page-transition transforms contain its fixed layer.
The recovery action now portals to the body and reserves the existing mobile
launcher clearance above navigation. The browser test asserts body placement,
non-overlapping bounds and an ordinary unforced pointer click.

## Validation boundaries

Local TypeScript, scoped ESLint, 19 existing Mentor workspace/stage/surface tests,
frontend style and public UI authority checks pass. No dependency or lockfile change.
The dedicated FA/EN 320px acceptance now additionally asserts native `:modal`,
rejection of background focus, Tab containment, minimize/restore focus, body-scroll
recovery, light color-scheme reflow and no sheet animation under reduced motion.

Browser execution for this new delta is pending CI: local Chromium installation
failed because the download returned an invalid/truncated archive. Existing parent
browser success is not evidence for this delta. Real-device, contrast and complete
locked/degraded action acceptance remain required before Ready.

## Existing accountable-review reconciliation

The parent CI failed on stale risk dates. The repository owner's already-approved
2026-10-02 review exists in immutable source commit
`d54707ec1e274185c5efd1c66d7a8049064af231` on the #705 track. This branch
carries its exact existing blobs, without rewriting approval wording:

- `docs/LAUNCH_ACCEPTED_RISKS.md`: `4374e2cdf4462fef603bd5e6cf55a1df614fd917`
- prepared request: `f78b4437715b08c66d1ecbb7924b5359e66ec9d2`
- existing R-08 review: `1abc86f0ef7040edd3d4b6e89cb448751a899c11`

The next weekly review remains 2026-10-09 and R-08 remains 2026-10-14.
No new review/approval, operational measurement, historical candidate-bound
signoff, NOG-08 acceptance or Go decision is created. R-04 and all product-disabled
boundaries remain open. The local authority guard now reports only that its
GitHub approval-origin verification requires GITHUB_TOKEN; authenticated CI must
verify origin. Local policy tests are separate from that origin verification.

## Unsaved conversation and request recovery follow-up

The preceding modal fixes passed all eight exact-head workflows on
`b09b967ddd2af907aacb81a0681b3f50fd7dac9c`, including 35 browser tests.
The following delta requires its own browser evidence.

| Before | After | Why |
| --- | --- | --- |
| An empty saved-thread index cleared the current chat after a reply. | Index refresh updates the list without deleting unsaved messages. | Ephemeral and prepared guidance must remain readable. |
| A rejected initial history fetch could clear a newly composed conversation. | History results apply only to their captured conversation generation. | Delayed responses must not overwrite newer user intent. |
| An abandoned answer refreshed history in the new conversation. | Each ask advances the generation; abandoned replies return without a refresh. | Starting over must preserve the new draft and empty chat. |

This applies React's documented guidance to ignore obsolete async results:
https://react.dev/reference/react/useEffect and
https://react.dev/learn/synchronizing-with-effects. No new caching dependency or
server authorization change is introduced.

Dedicated FA/EN 320px browser cases cover provider failure, rate limiting, expired
session recovery links, unavailable capabilities with Premium controls disabled,
prepared/live provenance, successful retry, abandoned answers, network failure,
and history retry preserving the current chat. API fixtures prove client behavior
only; they do not establish backend entitlement or persistence authority.

Local TypeScript, scoped lint and 14 existing workspace/stage tests pass.
Full device/contrast acceptance and independent current-head review remain open.

The compact matrix additionally scans the expanded workspace and native history
dialog with the existing pinned axe-core dependency in both persisted dark and
light themes. It asserts the root theme class rather than inferring theme from
OS preference, attaches mapped WCAG violations, and checks the composer in
forced-colors mode. Automated scans cannot establish complete WCAG conformance
or physical-device keyboard behavior; this delta still needs CI execution.

## Theme and new-chat focus correction

Static inspection of the persisted light theme found fixed pale foregrounds on
the shared light page background. The outer title, presence, Pro control and
Academy return links now use governed theme tokens; the dark conversation panel
retains an explicit readable foreground. The axe workspace scan includes the
page's ContentShell so that the return link is covered too.

| Before | After | Why |
| --- | --- | --- |
| Pale title `#f8fafc` on light `#f7fbff`: approximately 1.01:1. | Governed text `#06111f`: approximately 18.23:1; control `#064f93`: 7.93:1; secondary text `#475569`: 7.29:1. | Theme changes must preserve readable foreground/background pairs. |
| New chat scheduled both trigger restoration and composer focus using competing timers. | It closes history without trigger restoration and focuses the composer on the next frame. | A deliberate new conversation should leave the user ready to write. |

These ratios use the WCAG relative-luminance formula for the named solid token
pairs; actual composited browser contrast is verified separately by axe.
Reference: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html.
The late-response browser case now also asserts new-chat composer focus.

The first expanded run on `2a33970eb63c7eced71f313ed1cb2e211c2cfec9`
passed the existing four-project matrix and both abandoned-response/modal cases.
It exposed invalid labels on generic office containers; meaningful achievement,
award and monitor groups now have explicit group semantics. Recovery assertions
also accidentally selected Next's route-announcer alert: the fixtures now scope
the alert to the workspace, retaining all message/provenance/retry assertions.
No WCAG rule or failure threshold is disabled.

## Visible Premium lock reasons

The office's disabled monitor controls previously relied on an icon and an ARIA
label for their Premium lock reason, while compact labels shrank to 7px. They now
show a localized reason beside their label with 12px text, wrapping rather than
truncating. Disabled controls retain readable foregrounds; lock semantics and
server capability admission remain unchanged. The office reserves space above
the control row for its existing scene and uses system colors in forced-colors
mode. The FA/EN failure case asserts both visible lock reasons and minimum font
size. This is a client affordance correction, not an entitlement change.

On `fd93474036ff0a1a4e39ee771e7fe2ce889225f8`, the strengthened browser
matrix passed: 43 tests including both locale recovery/network/stale-response
cases and zero detected WCAG violations in persisted dark/light ContentShells
and history dialogs. This proves that checkpoint, not the subsequent visible
lock delta. The recovery case additionally exercises a missing-thread error and
its explicit new-conversation action; it verifies empty messages and focused,
enabled composition after recovery.

The visible-lock/missing-thread checkpoint `079d4ff8b226dd02a19dabbcd266430c82e66871`
also passed all 43 browser tests. A further geometry review found that the 315px
standing pose at tablet widths needed its own clearance above the enlarged
controls. The tablet scene now reserves 520px while phones retain 420px. The
theme case checks that a composing standing pose stays inside the 768px tablet
scene and attaches phone dark/light and tablet forced-colors office images for
visual review. No animation or renderer authority is added.

Visual inspection of the new phone images exposed a remaining parent-frame
mismatch: the office wrapper still reserved its old 340/390px height, allowing
the taller scene to extend into the next row. A shared workspace CSS variable now
sets both wrapper height and scene minimum height at each compact breakpoint.
The recovery case asserts scene containment in its parent; captures explicitly
center the office so fixed shell navigation does not obscure the review image.
Tablet captures and standing-pose bounds had already passed on
`efa38cb724e10b058cd4387f6d09e1d136ca05f1`; the wrapper correction needs a
fresh exact-head run.

On `ad870b16062d982ff438fa58b9a4e2f5c3f1fcde`, all 43 browser tests
passed and the reviewed phone captures show the complete, contained control row.
The English capture also exposed a clipped Core workspace badge: the office
heading now has a shrinkable flex column while the plan badge retains its full
width. A FA/EN 320px geometry assertion checks the badge remains inside the scene.

A successful reply can bind a thread ID even when its memory mode is ephemeral.
Binding that ID now preserves the rendered chat instead of rehydrating it from
the history endpoint; explicit selection of a different saved thread still
hydrates history. New conversation and history selection clear the binding.
The compact FA/EN recovery fixture returns a thread ID with ephemeral memory and
makes history unavailable, verifying that the fresh response survives and that
binding alone does not issue a history read. This is client behavior evidence,
not a claim of server persistence or entitlement.
