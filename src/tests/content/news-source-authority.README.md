# Publication authority acceptance gate

This branch is intentionally Draft-only until all of the following are true:

1. Publication intelligence resolves source identity through `news-source-authority`.
2. Registry-known sources with missing readiness become review-bound, not `source_not_authorized`.
3. Unknown and quarantined sources remain blocked.
4. Entity resolution covers project/network/exchange/regulator entities, not only coin/tool.
5. Organic growth readiness cannot override publication readiness.
6. Exact-head CI is green.
7. Staging canary is run only after explicit deploy approval.
