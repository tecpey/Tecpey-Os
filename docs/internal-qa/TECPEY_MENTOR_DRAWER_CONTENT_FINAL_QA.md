# TecPey Mentor Drawer + Content Completion Patch QA

## Applied fixes
- Global AI Mentor drawer was resized for mobile and desktop.
- Close and minimize controls are now always in the visible header area.
- Drawer uses a controlled max-height and internal scroll instead of overflowing the viewport.
- Suggested questions and input area remain accessible inside the drawer.
- Floating mentor button remains available without covering the main Academy CTA.
- Persian and English Rules pages were rewritten with specific crypto/security/trading rules.
- Persian and English Start Guide pages were rewritten as practical step-by-step onboarding pages.

## Targeted issues from screenshots
- Oversized mentor popup: fixed with `max-h`, `flex-col`, `min-h-0`, internal scroll.
- Missing close/minimize on smaller viewports: fixed with compact sticky top header controls.
- Generic/non-specialized rules content: replaced with crypto-specific user responsibilities.
- Generic/non-specialized start guide: replaced with actionable safe-entry flow.

## Local test command
```bash
npm install
npm run build
npm start
```

## Manual QA checklist
- Open Home on mobile and desktop.
- Tap “از مربی بپرس”.
- Confirm drawer opens without leaving the page.
- Confirm close/minimize buttons are visible.
- Confirm suggestions and input are visible.
- Visit `/rules`, `/en/rules`, `/start-guide`, `/en/start-guide` and confirm content is complete and brand-relevant.
