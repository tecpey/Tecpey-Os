# News source authority canary fixtures

Required deterministic fixtures for convergence:

- `thedefiant.io`: registry-known; must never be mislabeled unknown; publication requires readiness evidence.
- `chainalysis.com`: registry-known first-party source; must never be mislabeled unknown; publication requires readiness evidence.
- `sec.gov`: registry-known official source; publication requires readiness evidence.
- `coindesk.com`: registry-known and readiness-backed.
- `unknown-source.example`: must remain blocked.

Entity-resolution follow-up fixtures must cover Curve, Base, Chainlink, OFAC, Moonwell, Bitwise and Lighter without inserting a generic `market` entity.
