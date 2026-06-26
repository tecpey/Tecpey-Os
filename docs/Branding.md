# TecPey — Brand Guidelines

## Brand Identity

| Element | Value |
|---------|-------|
| **Brand name** | TecPey |
| **Persian name** | تک‌پی |
| **Tagline (en)** | Your Safe Entry Point to the Crypto Market |
| **Tagline (fa)** | نقطه امن ورود به بازار رمزارز |
| **Company** | TechnoPardakht |
| **Domain** | tecpey.ir |
| **Exchange** | my.tecpey.ir |

---

## Brand Voice

### English
- Clear, calm, educational
- Never hype, never promise profit
- Treats users as intelligent adults
- Security and education first — always

### Persian (فارسی)
- رسمی اما صمیمی
- ساده، شفاف، قابل فهم
- هیچ‌گاه تضمین سود یا ترغیب به معامله
- آموزش و امنیت در اولویت

---

## Primary CTA Hierarchy

The landing page always maintains exactly two equal primary actions:

| Language | CTA 1 | CTA 2 |
|----------|-------|-------|
| Persian | ورود به صرافی | آکادمی رایگان |
| English | Enter Exchange | Enter Academy |

Helper text below Academy CTA (small, not competing):
- **fa:** برای شروع مطمئن، آکادمی کنار توست.
- **en:** For a confident start, the Academy is with you.

---

## Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| **Primary (Cyan)** | `#06B6D4` | Buttons, links, accents, icons |
| **Primary Dark** | `#0891B2` | Hover states |
| **Background (Light)** | `#F7FBFF` | Page backgrounds (light mode) |
| **Background (Dark)** | `#06111F` | Page backgrounds (dark mode) |
| **Text (Light)** | `#06111F` | Body text (light mode) |
| **Text (Dark)** | `#FFFFFF` | Body text (dark mode) |
| **Muted** | `#64748B` | Secondary text |
| **Card (Light)** | `#FFFFFF` | Card backgrounds |
| **Card (Dark)** | `#07111F` | Card backgrounds (dark) |
| **Border** | `rgba(34,211,238,.15)` | Card and input borders |
| **Success** | `#10B981` | Positive states |
| **Warning** | `#F59E0B` | Caution states |
| **Error** | `#EF4444` | Destructive/error states |

### CSS Tokens

```css
--tp-primary: #06b6d4;
--tp-bg: #f7fbff;
--tp-text: #06111f;
--tp-muted: #64748b;
--tp-card: #ffffff;
--tp-border: rgba(34, 211, 238, 0.15);
```

---

## Typography

| Context | Font | Weight |
|---------|------|--------|
| Persian headings | IRANYekanX | 900 (Black) |
| Persian body | IRANYekanX | 700 (Bold) |
| English headings | Inter | 900 (Black) |
| English body | Inter | 700 (Bold) |
| Code | System monospace | 400 |

### Type Scale

| Role | Size | Class |
|------|------|-------|
| Hero H1 | 3.75rem (60px) | `text-6xl font-black` |
| Section H2 | 2.25rem (36px) | `text-4xl font-black` |
| Card H3 | 1.25rem (20px) | `text-xl font-black` |
| Body | 0.875rem (14px) | `text-sm font-bold leading-7` |
| Caption | 0.75rem (12px) | `text-xs font-bold` |
| Label / Eyebrow | 0.75rem (12px) | `tp-label` |

---

## Border Radius System

| Size | Value | Usage |
|------|-------|-------|
| Small | `0.75rem` (`rounded-xl`) | Badges, chips, small elements |
| Medium | `1rem` (`rounded-2xl`) | Buttons, inputs |
| Large | `1.5rem` (`rounded-3xl`) | Cards, panels |
| XL | `1.875rem–2.25rem` (`rounded-[30-36px]`) | Hero cards, feature panels |

---

## Logo

- File: `/public/images/tecpey-logo.png`
- Dimensions: 512×512px
- Format: PNG with transparency
- Usage: Always use on appropriate contrast background
- Do not distort, recolor, or add effects to the logo

---

## Icons

TecPey uses [Lucide React](https://lucide.dev) for all UI icons.

- Stroke width: default (`1.5`)
- Size in cards: `h-6 w-6`
- Size in buttons: `h-5 w-5`
- Size in labels: `h-3.5 w-3.5`
- Color: inherit from parent or explicit `text-cyan-500`

---

## Spacing System

TecPey follows the Tailwind CSS spacing scale with these standard section patterns:

```
Section horizontal padding: px-4 sm:px-6 lg:px-8
Section vertical padding:   py-14 (hero), pb-16 (content), pb-10 (tight)
Max content width:          max-w-7xl
Card internal padding:      p-6 (standard), p-8 (large)
Grid gap:                   gap-4 (tight), gap-5 (standard), gap-6 (relaxed)
```

---

## Shadow System

| Name | Value | Usage |
|------|-------|-------|
| Card | `0 20px 70px rgba(0,0,0,.12)` | Standard cards |
| Card hover | `0 28px 85px rgba(34,211,238,.16)` | Hovered cards |
| Button | `shadow-xl shadow-cyan-500/20` | Primary CTAs |
| Button hover | `shadow-2xl shadow-cyan-500/30` | Hovered CTAs |
| Sticky bar | `0 -18px 50px rgba(0,0,0,.35)` | Mobile CTA bar |
