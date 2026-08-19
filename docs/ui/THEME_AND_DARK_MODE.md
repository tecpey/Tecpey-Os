# TecPey Theme and Dark Mode

## How theming works

TecPey is **dark-mode-first**. The theme is class-based, not
`prefers-color-scheme`:

- `next-themes` runs with `attribute="class"`, `defaultTheme="dark"`,
  `enableSystem={false}` (`src/components/theme-provider.tsx`), so the app opens
  in dark mode and toggles the `dark` class on the root element. Users can switch
  to light with the `ThemeToggle` in the navbar.
- Tailwind v4's `dark:` variant is wired to that same class —
  `@custom-variant dark (&:is(.dark *))` in `src/app/globals.css` — so `dark:`
  utilities and the CSS token system agree. The brand tokens
  (`src/app/tecpey-brand-tokens.css`) define light values on `:root` and dark
  values under `.dark` (`--tp-bg`, `--tp-text`, …).

The shell components (`EnglishShell`, content shells) paint their background and
text from those tokens, so the frame adapts automatically. **Content inside the
shell does not** — a card that hardcodes a light surface (`bg-white`,
`bg-cyan-50`, `text-slate-950`) with no `dark:` counterpart renders as a stark
light block in the default dark theme.

## Convention

- Prefer theme-aware colors (brand tokens, or translucent surfaces like
  `bg-white/[0.055]`) for content.
- When a card styles an opaque light surface, give it a `dark:` counterpart so it
  adapts in the default dark theme.
- **Bilingual page pairs** (a Farsi page and its English twin) must carry the
  **same** `dark:` treatment — otherwise one locale looks broken in the default
  theme while the other adapts. This is enforced by
  `src/tests/ui/content-theme-parity.test.ts`; add new pairs to its list as they
  ship.

This is a consistency convention, not a claim that every page is fully
dual-theme: some surfaces are intentionally fixed-dark (explicit `bg-slate-950`
and similar). The rule is that a page must not be **accidentally** half-themed,
and that translated twins must match.
