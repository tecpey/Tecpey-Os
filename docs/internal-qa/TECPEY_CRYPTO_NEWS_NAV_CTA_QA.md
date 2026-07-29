# TecPey Crypto News Navigation + CTA QA

## Changes
- Added `اخبار رمزارز` to the Persian footer under `بازار و معامله`, beside Markets and Coins.
- Added `Crypto News` to the English footer under `Markets & Trading`, beside Markets and Coins.
- Added top navigation entry: `اخبار` / `News` linking directly to `/crypto-news` and `/en/crypto-news`.
- Kept active navigation/footer styling so the current page remains highlighted in cyan.
- Removed the redundant `مشاهده همه اخبار` / `Open News Center` CTA from the full Crypto News page.
- The CTA remains only in compact Home sections, where it actually navigates from Home to the full news page.

## QA Targets
- `/crypto-news` should not show a self-linking “View all news” button at the bottom.
- Footer and header should include direct News navigation.
- Persian and English routes are both supported.
- No change to the dynamic news API behavior.
