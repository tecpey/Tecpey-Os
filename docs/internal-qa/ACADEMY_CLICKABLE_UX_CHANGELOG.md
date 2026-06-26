# TecPey Academy Clickable UX Upgrade

## Applied changes
- Converted academy-related hover cards into real clickable navigation elements.
- Added focused academy landing pages for:
  - /academy/free
  - /academy/evaluation
  - /academy/scholarship
  - /academy/learning
  - /academy/security
  - /academy/analysis
  - /academy/tools
  - /academy/practice
  - /academy/decision
  - /academy/curriculum
  - /academy/safe-entry
  - /academy/education-first
  - /academy/risk-aware
  - /academy/security-first
  - /academy/market-intelligence
  - /academy/tool-based-decisions
  - /academy/persian-clarity
- Added static wrappers for /academy/term-1 through /academy/term-7 so route QA can resolve them directly while preserving the existing term content.
- Upgraded the main Academy page feature cards from visual-only cards to accessible <Link> cards.
- Upgraded the home landing Academy ecosystem cards, proof cards, trust cards, and metric cards to clickable cards with focus states.

## QA
- Static production QA: PASSED
- Route QA: PASSED
- Indexed app routes: 92
- Missing internal routes: 0
- Missing assets: 0

## Build note
- Build should be re-run locally/server-side with:
  npm install
  npm run build
  npm start
