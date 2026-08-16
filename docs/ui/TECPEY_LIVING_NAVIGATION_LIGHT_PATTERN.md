# TecPey Living Navigation Light Pattern

Status: UI motion design-system draft
Scope: mobile bottom navigation, desktop side navigation, tabs, segmented controls, Mentor state, notification center, profile/certificate progress
Brand: TecPey official blue/cyan identity, Persian-first, trust-first, financial-product safe

## 1. Pattern Intent

`TecPey Living Navigation Light` is a reusable microinteraction pattern for showing active navigation state through a subtle moving light.

The pattern must make the product feel alive, intelligent, and responsive without becoming decorative noise. It should feel like the platform is guiding the user, not entertaining them.

Primary purpose:

- Clarify the active destination or state.
- Give immediate tactile feedback after a tap, click, keyboard focus, or route change.
- Create a premium, living-product feel aligned with TecPey Mentor and Smart Notification principles.
- Preserve trust, speed, and readability in financial and educational workflows.

## 2. Core Behavior

When the user changes active navigation item:

- A cyan/blue light travels from the previous active item to the new active item.
- The active icon and label brighten.
- A soft ring, halo, underline, or rail appears around the active item depending on component type.
- The inactive items remain readable but visually quiet.
- The motion finishes quickly and never blocks interaction.

The light may feel slightly physical, but it must stay restrained:

- No exaggerated bounce.
- No long trails.
- No distracting particle effects.
- No fake live-market movement.
- No purple generic SaaS glow unless explicitly mapped to a specific non-core context. TecPey default is blue/cyan.

## 3. Recommended Surfaces

| Surface | Pattern application |
| --- | --- |
| Mobile bottom nav | Active tab gets a moving cyan halo/ring and brightened icon/label |
| Desktop sidebar | Active item gets a narrow moving rail/light and subtle background tint |
| Dashboard top tabs | Active section gets a sliding light underline or capsule |
| Academy lesson tabs | Current lesson/term uses a calm active underline with progress-aware glow |
| Trading Arena modes | `Practice`, `Challenge`, `Replay`, and `Journal` use a moving active capsule |
| Mentor panel | Mentor state uses a soft pulse only for important new guidance |
| Notification center | Personalized, unread, or high-value notifications get a single short pulse |
| Profile/certificate progress | Current completion step gets a progress glow; verified state gets a stable mark |
| Admin panel navigation | Minimal rail only; no decorative halo |

## 4. Motion Specification

Default timing:

- Tap/click active movement: `180ms-240ms`
- Route-confirmed active state: `160ms-220ms`
- Hover/focus color response: `120ms-160ms`
- Notification pulse: one cycle, `700ms-1000ms`, no infinite looping except system-critical realtime state with explicit approval

Default easing:

- Active light movement: `cubic-bezier(0.23, 1, 0.32, 1)`
- Capsule/rail position: `cubic-bezier(0.32, 0.72, 0, 1)`
- Opacity/color: `ease-out`

Implementation constraints:

- Animate only `transform`, `opacity`, and GPU-safe filter values.
- Avoid animating `width`, `height`, `padding`, `margin`, or layout-affecting properties.
- Avoid `transition: all`.
- Use CSS transitions or WAAPI for simple deterministic movement.
- Use existing project motion tooling only if already present and justified.
- Keep motion interruptible; fast repeated nav changes must not queue stale animations.

## 5. Accessibility and Reduced Motion

Required behavior:

- Respect `prefers-reduced-motion`.
- Reduced motion keeps active color/contrast, but removes traveling movement.
- Focus state must be visible without relying on glow alone.
- Hover animation must be gated behind `@media (hover: hover) and (pointer: fine)`.
- Touch targets must remain at least mobile-friendly and not shift during animation.
- Persian RTL labels must stay stable and readable.

Reduced-motion fallback:

- Active item changes instantly or with a short opacity/color transition.
- No moving halo, no traveling light, no animated trail.

## 6. Financial Product Safety Rules

This pattern must never:

- Make financial numbers harder to read.
- Suggest fake live activity.
- Push risky trading behavior.
- Animate profit/loss states in a way that creates gambling-like excitement.
- Distract from risk warnings, security prompts, KYC/identity prompts, or certificate verification.
- Hide disabled, locked, pending, failed, or restricted states.

Trading Arena may use this pattern for mode navigation and learning feedback, but not to gamify reckless behavior.

## 7. Component Variants

### Mobile Bottom Navigation

Recommended structure:

- One active halo/ring shared across items.
- The halo moves to the active item.
- Icon and label brighten together.
- Safe area bottom spacing must be preserved.
- The active item should remain legible on both dark and light surfaces.

### Desktop Sidebar

Recommended structure:

- A narrow active rail on the edge nearest the content.
- A subtle cyan tint behind the active row.
- Optional tiny leading glow for premium surfaces.
- No large halo in admin or dense operational screens.

### Segmented Controls and Tabs

Recommended structure:

- A moving active capsule or underline.
- Text color changes after or during the movement.
- The selected item remains clear during async route loading.

### Mentor and Notification State

Recommended structure:

- A single pulse when new high-value personalized guidance arrives.
- The pulse should communicate presence, not urgency.
- Critical security notifications use clear alert styling instead of decorative light.

## 8. Acceptance Criteria

Any PR implementing this pattern must prove:

- The interaction has a purpose beyond decoration.
- Active state is visible without animation.
- Motion is under the default timing caps unless documented.
- Reduced-motion behavior exists.
- Touch and keyboard interactions are supported.
- RTL labels do not shift, clip, or blur.
- The pattern uses TecPey blue/cyan identity.
- The pattern does not animate sensitive financial data.
- The component is tested or manually verified on mobile and desktop.
- Admin/dense operational views use the restrained variant.

## 9. World-Class Quality Bar

This pattern must meet a premium product quality bar before being accepted into TecPey production UI.

Quality requirements:

- The motion must feel responsive on the first tap, not delayed.
- The light must land exactly on the active item, with no visible off-by-one alignment.
- The component must handle fast repeated taps without visual glitches.
- The active state must remain correct during route loading, failed navigation, and browser back/forward.
- The bar, rail, or capsule must not shift layout when labels change.
- The glow must be visible on dark surfaces but never bloom over text.
- The interaction must be calm enough for repeated daily use.
- The implementation must avoid template-like purple/neon aesthetics and preserve TecPey blue/cyan authority.
- The motion must still feel intentional at 1x speed and when inspected in slow motion.

Rejection criteria:

- `transition: all`
- Infinite glow loops on primary navigation
- Active state visible only through animation
- Hover animation on touch devices
- Layout movement caused by active state
- Blur or glow reducing text readability
- Animation applied to financial balances, PnL, risk warnings, or identity/security prompts
- Decorative particles, excessive bloom, or generic crypto-casino styling
- Any motion that makes TecPey feel less serious or less trustworthy

Verification checklist:

- Desktop screenshot before and after active item change.
- Mobile screenshot before and after active item change.
- Keyboard navigation check.
- RTL label fit check.
- Reduced-motion check.
- Fast repeated tap/click check.
- Route-loading state check where the component changes routes.
- Contrast/readability check on active and inactive states.
- Performance check: no layout thrash, no long main-thread animation, no avoidable repaint-heavy loops.

## 10. Product Governance

This pattern should be treated as part of TecPey's living-platform language:

- Dashboard uses it to make navigation feel alive.
- Mentor uses it to signal helpful presence.
- Smart Notification uses it to mark timely personalized guidance.
- Academy and Arena use it to guide progress and current state.

The pattern is not a blanket permission for decorative motion. Every use must remain trust-first, readable, fast, and purposeful.
