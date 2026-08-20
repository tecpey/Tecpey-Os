# Enterprise Global Product Readiness Authority — 2026-08-20

**Authority:** `enterprise-global-product-readiness-v1`  
**Primary launch domain:** `www.tecpey.ir` for Iran  
**Next expansion domain:** `.com` global after Iran evidence closes  
**Current decision:** TecPey must not claim public financial, custody, or enterprise GO while the external evidence blockers remain open.

This authority converts the strict product/engineering audit into an executable release gate. It is intentionally not a feature PR. It makes the current world-class readiness baseline permanent, measurable and fail-closed.

## Baseline

| Metric | Locked Value |
|---|---:|
| Governed controls | 41 |
| `EVIDENCE_READY` controls | 34 |
| `BLOCKED_EXTERNAL` controls | 7 |
| Control/evidence readiness | 82.9% |
| P0 readiness floor | 70% |
| Route-scoped JSON-LD debt | 85 routes |
| Screenshot evidence matrix | 175 routes × 4 viewports = 700 slots |
| Global `.com` readiness floor | 42% |

The registry lives in `config/enterprise-global-product-readiness.json`. The executable gate is:

```bash
npm run product:global-readiness:check
```

## External Blockers

| ID | Blocker | Wave |
|---|---|---|
| `OPS-010` | Protected staging activation and production-like env evidence | A |
| `OPS-011` | Backup restore and recovery reconciliation drill | A |
| `OPS-012` | Incident red-team and critical probe evidence | A |
| `OPS-013` | Accepted-risk owner signoff evidence | A |
| `OPS-014` | Go approval matrix for current exact head | A |
| `QA-050` | 700-slot desktop/mobile RTL/LTR screenshot matrix captured | A |
| `QA-051` | Runtime axe, keyboard, focus, contrast and reduced-motion evidence | A |

## Benchmark Contract

TecPey must not compete as a simple article hub or a generic exchange clone. Each content and product workflow must connect:

`trusted news -> FA/EN analysis -> tag/entity graph -> coin/tool update -> micro lesson -> Arena scenario -> Mentor feedback -> user skill profile -> conversion`

Every automated content item must produce four governed outputs:

1. Public SEO/AEO/GEO block: canonical, OG, Twitter, JSON-LD, FAQ/HowTo/Article schema, hreflang, citations and freshness.
2. Product graph update: coin/tool/news/academy/arena route links, related graph and duplicate suppression.
3. Education output: lesson snippet, quiz, flashcard, risk note and Arena exercise.
4. Control output: source credibility, editorial status, copyright-safe excerpt, malicious-link scan and correction/version history.

## Operational Waves

| Wave | Goal | Expected Result |
|---|---|---|
| A | Convert external evidence into reality | P0 readiness moves from 70% to 92% |
| B | Burn down route-scoped SEO/AEO/GEO debt | SEO/AEO/GEO moves from 79% to 92% |
| C | Product excellence for Iran launch | Product readiness moves toward 88% |
| D | Prepare `.com` global expansion | Global readiness moves from 42% to 70% before build |

## Guard Behavior

The gate fails when a PR:

- removes any of the 41 governed controls;
- lowers the `34/41` evidence-ready baseline;
- hides or reduces the seven P0 external blockers;
- claims public financial, custody, enterprise, or global exchange GO;
- drops the 700-slot UI screenshot evidence matrix;
- drops the 85-route JSON-LD burn-down queue;
- removes the Binance/Coinbase/TradingView/Google/IndexNow/Binance API benchmark checklist;
- weakens the Iran-first and `.com`-next strategy.

This gives TecPey a permanent world-class product-readiness instrument: future PRs can improve the numbers, but cannot quietly lower the standard.
