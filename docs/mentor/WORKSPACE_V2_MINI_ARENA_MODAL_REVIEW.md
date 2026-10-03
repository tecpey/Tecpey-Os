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

## Selected history recovery

| Before | After | Why |
| --- | --- | --- |
| Retry refreshed only the thread index, hiding a failed message read when the index succeeded. | Index and conversation errors are independent; retry re-reads an empty selected conversation and retains its warning until that read succeeds. | Recovery must restore messages, not merely dismiss an error. |
| Repeated retries could overlap while requests were running. | Retry is disabled while either relevant history request is loading. | Keep request order and feedback predictable. |
| History loading displayed only an accessibility-hidden spinner. | Localized visible loading text uses a status region for list and saved-message requests. | Explain the wait to sighted and assistive-technology users. |
| The provider-use flag labelled an answer “Live AI,” without proving source freshness. | The badge says “AI-generated answer” and retains the separate unsaved-memory notice. | A model response must not imply live market data or verified freshness. |
| The answer-origin and unsaved-memory badge used 7px text. | The badge uses 12px text, bounded wrapping and readable line spacing; compact captures include the recovered answer. | Trust and persistence notices must remain legible on the smallest supported screen. |

The compact FA/EN regression first preserves an unsaved chat through an index
failure, then explicitly selects saved history. A repeated message-read 503 must
keep the retry visible even when the index succeeds; a subsequent successful
read must restore the saved guidance. A nonempty current chat is not replaced by
a retry. The effect retains AbortController cleanup when selection or retry
changes, following https://react.dev/reference/react/useEffect and
https://react.dev/learn/synchronizing-with-effects. These fixtures validate the
client recovery contract, not persistence or server entitlement authority.

## Public source inspection

| Before | After | Why |
| --- | --- | --- |
| Source and lesson links used 8px text and 36px targets. | Links use 12px text, 44px minimum height and bounded wrapping; source headings use 12px text. | Make evidence inspection usable on compact screens. |
| Public sources showed only a title and an external-link icon. | A source shows its URL-derived host, isolated for RTL, and a localized new-tab cue. | Help users identify the destination before opening it while preserving chat context. |
| Response URLs were passed straight to an anchor. | Presentation accepts absolute HTTP(S) links without embedded credentials; invalid links and an all-invalid source block are omitted. | Keep malformed response data from becoming an actionable source link. This is presentation defense, not server provenance authority. |
| Initial source captures aligned a bottom-edge link behind fixed navigation, so they did not prove readable presentation. | Keyboard-visible evidence-link focus reveals the target immediately; the compact test asserts that its bottom clears navigation before capturing. Pointer focus does not reposition the target. | Make focused evidence reachable and obtain reviewable evidence without interrupting a pointer click. |

The FA/EN 320px recovery fixture includes a valid public source and an invalid
scheme. It checks the destination, new-tab cue, opener isolation, readable font,
touch height and absence of the invalid actionable link, and attaches a source
capture. Host display does not establish publication time, freshness, credibility
or verification; those acceptance items still require named server evidence.
W3C G200 describes advance new-tab cues as advisory practice, not a standalone
WCAG conformance requirement:
https://www.w3.org/WAI/WCAG22/Techniques/general/G200.html.

## Private insight snapshot isolation — 2026-10-03

| Before | After | Why |
| --- | --- | --- |
| A five-minute module cache shared private profiles across mounted consumers without a principal or tenant key; a new consumer could skip the server entirely. | Each mounted consumer starts empty and fetches the authenticated endpoint with `cache: no-store`; no private module cache remains. | A previous response cannot authorize a later page visit. This closes a client reuse path, without claiming to replace the server tenant/product gates. |
| Failed refreshes kept the previous profile; `storage: unavailable` looked like a successful empty response. | HTTP errors, invalid JSON or failed responses and explicit storage outages return no profile with unavailable state. Retry invalidates the visible snapshot immediately; aborted requests cannot overwrite the current attempt. | An unavailable authority must not leave an old learner assessment presented as current. |
| Disabled consumers initialized from shared data. | Disabled consumers expose no data; changing enabled state resets their instance snapshot before it can be rendered again. | Disable/re-enable cannot republish an earlier authorization snapshot. |
| The hook carried a synchronous effect-state lint exception. | The effect only commits asynchronous request outcomes; the existing exception is removed from the baseline, suppression inventory and reviewed key set. | Remove the debt rather than expand an exemption. |

Primary implementation basis: React effect request cleanup,
https://react.dev/reference/react/useEffect and
https://react.dev/learn/synchronizing-with-effects.

The added FA/EN compact browser regression deliberately keeps the same document
alive through Next.js client navigation: an initial observed 87% fixture is
followed by a 401 response on return, which must cause a fresh read and remove
the old score. Synthetic client fixtures do not prove production identity
switching, backend entitlement, database isolation or continuous revocation of an
already mounted page. No polling or new dependencies are introduced. Independent
consumers now make independent reads; the existing server rate limit is unchanged.
Local TypeScript, scoped lint and correctness-authority checks are required;
new exact-head production-browser evidence remains pending until CI completes.

The first run (`37110280092`, head `3a53481cf4ea4211ce1583e62372b438251ede01`)
reached an exact 87% DOM value but failed its visibility expectation in both
320px projects: the compact stylesheet intentionally hides `.chatEvidence`.
The regression now checks the exact DOM value/count, then its removal, while
retaining the fresh-read and same-document assertions. This is data lifecycle
acceptance and makes no new visible compact-score claim. Other browser cases
passed; the corrected exact head requires a fresh run.

## Profile evidence states and explicit recovery — 2026-10-03

| Before | After | Why |
| --- | --- | --- |
| Profile loading, server failure and insufficient learning evidence all appeared as a dash; the localized unavailable copy was unused. | A persistent 14px status below the conversation header distinguishes checking, unavailable, insufficient and observed evidence in FA/EN, including the 320px layout. | Absence of evidence and failure of its authority must have different explanations. Conversation input stays usable. |
| A numeric confidence value was displayed without checking its evidence state. | Only `observed` evidence with a finite numeric score in [0,100] may reach the chat/office score. Zero remains valid; provisional, unknown, out-of-range and string values remain unscored. | Enforce the server evidence policy at presentation without inventing a learner fact or converting a string into evidence. This is a product score, not statistical model confidence. |
| A failed profile read had no reachable retry in the workspace. | A stable 44px refresh control explicitly rechecks the authenticated endpoint; it is `aria-disabled` with an event guard while pending, retains keyboard focus and never disables the composer. | Recover from a transient outage without reloading or losing a chat draft. The focus target stays mounted through all status changes. |

The status text has `role=status` and `aria-atomic=true`; its refresh button is a
separate sibling, not an interactive live-region message. Forced colors use
system colors. There is no new motion, dependency, profile persistence or server
policy change. No publication freshness or continuous-session revocation claim
is added.

Primary accessibility basis:
https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html and
https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22.

The FA/EN compact regression holds a retry request to inspect visible loading,
keyboard focus, duplicate-activation rejection and an enabled composer. It checks
provisional/unknown evidence, both score bounds, string values, genuine zero,
observed recovery and explicit `storage: unavailable` after recovery. It captures
unavailable/insufficient/observed states for manual visual review and retains the
existing dark/light axe harness. Synthetic browser fixtures verify presentation
and recovery only; server evidence thresholds and production identity need their
separate governed runtime proof. New exact-head browser evidence is pending.

## Academy progress request ordering and unavailable counts — 2026-10-03

| Before | After | Why |
| --- | --- | --- |
| Focus/progress events launched independent requests; an obsolete response could overwrite a newer result or finish its loading state. | A refresh aborts its predecessor, shares a controller across both authority reads and guards commits/finalization after each asynchronous boundary. Cleanup aborts on unmount/locale change. | Completion evidence belongs to the current request, not whichever response happens to arrive last. |
| Failed refreshes retained prior term/XP/streak/badge data; 401 was treated as verified empty progress. | Pending refreshes clear the previous snapshot, and rejected/failed reads leave an explicit error with no prior achievements. Locale-mismatched snapshots are not exposed. | An unavailable or rejected authority cannot keep displaying earned progress as current. |
| Invalid JSON or missing authority payloads silently became empty progress. | Both successful endpoint bodies must provide their expected terms-array/state-object shapes; invalid bodies remain unavailable. A valid empty snapshot remains a genuine zero. | Distinguish a failed read from evidence of no completed terms. No reward values are reconstructed. |
| Mentor showed `0/7` before progress was known and passed the old count into office achievement markers. | The header announces checking/unavailable states; only a loaded, successful snapshot supplies a count. Unknown completion passes null to the office, producing no earned marker or credential row. | Avoid fabricated zeros and stale achievement presentation. Server entitlement/reward/progress policies remain unchanged. |

Primary request-lifecycle basis: https://react.dev/learn/synchronizing-with-effects.
The compact FA/EN regression begins with three passed terms, delays an older
seven-term response, then obtains a fresh 401. Its adversarial fetch wrapper
intentionally ignores cancellation for the delayed response; releasing it must
not restore seven terms or earned markers. It also checks invalid successful
payloads remain unavailable and a valid empty response restores genuine zero.
This is a synthetic client ordering/presentation test, not server identity,
reward issuance or database isolation evidence. Current-head browser acceptance
and the new localized count-state captures are pending.

The first ordering run (`37118639622`, head
`8affee769688c998e39689549f1d068380c6ff7b`) passed 49 browser tests,
including both adversarial compact cases. Manual FA/EN count-state captures then
revealed the new status inherited the old 10px compact metric font. That is a
readability finding, not a claim that WCAG defines a 12px minimum. Evidence labels
now use a consistent 12px/1.6 line height after compact overrides. The strengthened
regression checks the actual font, viewport containment and every header button's
bounds during the longer unavailable state, and captures the entire header.
Exact head `6fa93738d7bc5ca63e0319c9cb65d54a18d2f629` passed 49
browser tests ([run 37119250641](https://github.com/tecpey/Tecpey-Os/actions/runs/37119250641));
the FA/EN full-header captures were manually reviewed with readable status text
and all three 44px actions inside the frame. All eight workflows completed
successfully, including protected PostgreSQL RLS runtime evidence
([run 37119250557](https://github.com/tecpey/Tecpey-Os/actions/runs/37119250557)).
This evidence applies to that exact parent, not subsequent edits.

## Source freshness disclosure — 2026-10-03

| Before | After | Why |
| --- | --- | --- |
| Source links exposed title, host and new-tab behavior without an adjacent freshness limitation. | Each public-source group includes a readable 14px FA/EN statement that publication times and freshness are unverified, and the answer is not verified current news. | `MentorReply.sources` contains only title/URL; a model-use flag or linked destination cannot establish current-news evidence. |

The notice is ordinary paragraph text within the answer, rather than a second
live region; the conversation already owns answer announcements. Its wording is
visible and does not rely on color or an icon. Accessibility basis:
https://www.w3.org/TR/WCAG22/ (perceivable text and meaningful structure), not a
claim that WCAG mandates this specific disclosure or font size. No new motion,
dependency, source timestamp or server authority is introduced.

The existing FA/EN compact recovery regression checks the precise notice and
its computed font size alongside the valid-source/unsafe-source tests. Exact-head
browser acceptance is pending for this edit. Source publication time and verified
freshness remain an open server-evidence gate; this disclosure does not complete
the current-news action contract.

## Arena rejected-access recovery — 2026-10-03

| Before | After | Why |
| --- | --- | --- |
| GET 401 removed the snapshot, but a delayed response could restore it because revision ordering accepts an incoming snapshot when current is null. | Access rejection fences every already-started request before clearing account evidence. A delayed GET or POST cannot apply a snapshot or replace the recovery state. | Cleared access context must stay cleared until a subsequent authorized read. |
| POST 401 could retain the account and trade form, or apply a snapshot-shaped rejected body before processing the error. | GET and POST share the same rejection handler; POST checks 401 before parsing/applying any snapshot. Account, pending command identity and success notice are removed, and the exact login/profile recovery gate is shown. | A rejected command cannot keep account evidence or an apparent success in the workspace. |
| Cleanup only tracked mounted status; development effect replay could make an older request appear mounted again. | Cleanup also fences already-started responses. | Request lifetime must be checked independently of mounted status. |

Primary lifecycle reference: https://react.dev/reference/react/useEffect and
https://react.dev/learn/synchronizing-with-effects. The existing database revision,
market freshness and ambiguous-command identity rules remain authoritative.
Non-401 outage handling and server authorization policies are unchanged.

The compact FA/EN negative regression begins with a synthetic valid account,
holds a GET, then obtains either a newer profile-required GET 401 or a
login-required POST 401. The rejected POST deliberately contains otherwise valid
snapshot fields. Releasing the old successful GET must not restore account/form;
the localized recovery destination and Escape focus restoration are checked.
Reopening the panel performs a new read. This is client recovery/presentation
evidence, not proof of tenant isolation, continuous revocation or command execution.
Local TypeScript, scoped ESLint, frontend/public guards and all 13 existing Arena
client-authority tests passed. Exact-head browser/CI acceptance is pending.

The first CI attempt (`37130966148`, head `cd315d30649af7aa2d93c5725097499a8fc5f8d4`)
rejected a baseline line drift: the existing initial execution-load finding moved
from 752:10 to 773:10. The baseline entry and its exact reviewed-key pin are
relocated together; rule, path, column, domain, reason, suppression count and
finding count are unchanged. This is not a new exemption or relaxed guard.

Head `9936986e9f7e84d91dd5f947febe1b24e921252a` passed 51 browser
tests and seven workflows; protected RLS remained pending. Manual review of four
FA/EN recovery captures revealed the FA POST gate retained the form's scroll
offset and hid the panel header. Recovery now focuses the appropriate link and
resets containers between that link and its native dialog to the top with instant
scrolling, including hidden-overflow ancestors that programmatic focus can scroll.
Standalone Arena retains normal page focus scrolling. The existing
load baseline moves one further line to 774:10, with no additional finding.
The strengthened regression checks recovery focus, zero dialog scroll offset,
visible header bounds and recovery-target containment before capturing each gate.
Fresh exact-head acceptance is required; the earlier crop is not accepted as a
complete recovery-layout proof.

The strengthened run on `064bc740aa8697ed7f865ae75b5355a6b227294c`
passed 51 browser tests, including recovery focus and scroll assertions. Its
element-level POST captures still omitted the header despite those assertions.
That capture discrepancy is not accepted as complete visual proof. Recovery
evidence now uses a full viewport screenshot, which does not prepare an element
by scrolling it; the test also checks both vertical header bounds and all three
header actions before capture. Fresh viewport evidence is required.
