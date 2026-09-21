# Monetization Experience — Free/Pro, ads, trials and governed grants

**Base:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** #699 Pro commercial/entitlement authority; #701/#703 define premium AI/Mentor capabilities. Growth/measurement may consume privacy-safe events but cannot override entitlement.

## Objective
Implement the intended Free/Pro product packaging without manipulative monetization or client-side fake entitlement.

## Packaging
- Free: core Academy + bounded Mentor/use limits + explicitly approved advertising placements;
- Pro: ad-free product surfaces + server-authorized premium AI/research/learning capabilities;
- capability matrix is versioned and server-owned;
- no UI copy claims a capability that the entitlement authority cannot return.

## Ads
- ad inventory/placement registry; content and controls remain visually primary;
- no ads in sensitive identity/KYC/security flows, assessment moments where they harm learning, or safety-critical financial confirmation;
- sponsored content is unmistakably labeled and excluded from organic news/research ranking unless disclosed as a separate channel;
- frequency caps, no deceptive close controls, no forced accidental taps;
- privacy/consent policy governs personalization; default can be contextual/non-personalized;
- Pro entitlement removes eligible ads server-side or through signed capability state, not CSS hiding only.

## Trials / promotional grants
- trial/grant is a first-class entitlement source with issuer, reason, startsAt, expiresAt and audit;
- graduation gift: intended one-month Pro after governed Term 7 graduation is idempotent, one-per-policy-version/user, and cannot be triggered by client progress;
- admin/support grants require permission, reason and expiry;
- overlapping paid/trial/grant entitlements reconcile deterministically without shortening a valid paid entitlement.

## Limits
- Mentor/AI quota/feature limits are explainable and fail safely;
- quota exhaustion may offer a lower-cost/free permitted route only if policy allows; it cannot silently change model/tool trust requirements;
- no fabricated scarcity (“only today”) unless a real campaign authority says so.

## UX
contextual upgrade only at meaningful capability boundaries; Free remains useful. Pricing/renewal/refund/cancel information comes from #699 authority. Purchase CTA remains disabled until provider/legal configuration is live.

## Acceptance
Ads, grants, trials and paid entitlements yield one deterministic capability snapshot. Graduation grant is exactly-once. Pro removes governed ads and unlocks only server-authorized capabilities; client manipulation cannot do either.
