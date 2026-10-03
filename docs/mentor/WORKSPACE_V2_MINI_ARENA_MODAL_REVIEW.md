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

The parent exact-head CI failure is the independent accepted-risk signoff evidence
authority guard. This UI delta does not renew dates, forge signoffs or waive that gate.
