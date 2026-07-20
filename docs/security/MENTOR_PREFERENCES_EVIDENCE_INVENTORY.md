# Mentor AI Preference Consent Evidence Inventory

Status: **P0 implementation inventory**  
Issue: **#205**  
Parents: **#161, #100, #156**  
Inventory base: **`8acf086c3db273efe095251941b929e63d2679e7`**  
Owner: **AI trust / security-platform**

## Active mutation

`PATCH /api/mentor-preferences` changes whether Academy Mentor AI may use an external provider and behavioral personalization. `real_exchange_signals_enabled` is intentionally forced false.

## Confirmed gaps

- preference state is upserted through standalone `withDb`;
- route emits detached legacy `risk_event` audit after commit;
- evidence failure cannot roll back consent state;
- IP/user-agent are copied into audit even though they are not required mutation evidence;
- identical requests churn consent timestamps and produce ambiguous mutation semantics.

## Required authority

The Mentor trust store must own one PostgreSQL transaction that locks/serializes the student preference row, detects no-op requests, updates changed consent state, forces real-exchange signals false and appends typed mandatory evidence. A no-op must not change `consented_at` or append a new event.

## Evidence contract

Action: `mentor.preferences.update`  
Resource: `mentor_ai_preferences`

Safe metadata is limited to policy version, domain-separated student fingerprint, resulting booleans and consent version. Raw student ID in metadata, IP, user-agent, request body, conversation data and provider content are forbidden.

## Route disposition

The route keeps strict revocation, CSRF, rate limits, bounded input and no-store headers. It delegates the mutation and contains no `writeAudit()` or client-controlled identity/tenant/evidence authority.

## Adversarial proof

- changed consent state and evidence commit together;
- forced evidence conflict rolls back the preference update;
- identical request is a no-op with stable timestamp and evidence count;
- concurrent updates serialize deterministically;
- real-exchange signals remain false;
- source guard prevents detached audit or direct route persistence.
