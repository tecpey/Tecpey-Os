---
name: motion-framer
description: Framer Motion / Motion animation patterns for React and Next.js. DEFERRED — framer-motion is not installed in TecPey. Use this skill as a reference only when the user explicitly approves adding the framer-motion dependency. Do not apply animation patterns from this skill without confirming the dep is installed.
---

# Motion / Framer Motion — TecPey Reference (DEFERRED)

**Source:** github.com/freshtechbro/claudedesignskills (SKILL.md)
**License:** Not confirmed — treat as reference, not redistributable
**Adoption:** DEFERRED — `framer-motion` is NOT installed in TecPey
**Audit date:** 2026-06-30

---

## Status

This skill is **deferred**. Reasons:

1. `framer-motion` is not in `package.json` — adding it requires explicit user approval
2. TecPey UX rule: "No unnecessary animation" — most surfaces should not add animation
3. Data-dense exchange surfaces (order books, price tables) must never animate
4. The skill's license could not be confirmed during Phase 28.5 audit

**Do not apply any patterns from this skill until:**
- The user explicitly instructs: "Add framer-motion to TecPey"
- `npm install framer-motion` is approved and run
- A specific surface is identified where animation serves a UX purpose

---

## Where Animation MAY Be Appropriate (TecPey)

If framer-motion is eventually installed, acceptable use cases:

| Surface | Pattern | Notes |
|---|---|---|
| Academy lesson progress | Progress bar fill on completion | Celebratory, meaningful |
| Certificate reveal | Fade-in + subtle scale | One-time reveal moment |
| Notification toast | Slide-in from edge | Functional: draws attention to state |
| Route transitions (Academy only) | Crossfade | Smooth context shift |
| Achievement unlock | Pop + settle | Reward moment |

**Never animate:**
- Order book rows (price flicker creates false urgency)
- Price ticker values (interferes with real-time reading)
- Form inputs
- Error messages (must appear instantly)
- Tables with >10 rows

---

## Animation Budget (TecPey UX Rules)

| Type | Max duration | Easing |
|---|---|---|
| Micro-interaction (button press) | 120ms | ease-out |
| Entrance animation | 200ms | ease-out |
| Layout transition | 300ms | spring (low stiffness) |
| Page transition | 350ms | ease-in-out |

Always include `useReducedMotion()` guard — disable all motion when the user
has `prefers-reduced-motion: reduce` set.

---

## Core Patterns (Reference — do not use without dep installed)

```tsx
// Guard — always check before animating
const prefersReduced = useReducedMotion();
if (prefersReduced) return <div>{children}</div>;

// Entrance fade
<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} />

// Exit (requires AnimatePresence wrapper)
<AnimatePresence>
  {visible && <motion.div exit={{ opacity: 0 }} key="element" />}
</AnimatePresence>

// Viewport trigger (Academy lesson cards)
<motion.div whileInView={{ opacity: 1 }} initial={{ opacity: 0 }} viewport={{ once: true }} />
```
