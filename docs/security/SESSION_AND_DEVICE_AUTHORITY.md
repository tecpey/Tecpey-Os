# Session and Device Authority

## Scope

This authority owns the durable session tuple after an authentication factor has succeeded:

- access-session JTI registration;
- refresh-token family admission and rotation;
- access-session to refresh-family binding;
- access/refresh to known-device binding;
- exact, family-wide and principal-wide revocation;
- known-device rename/removal;
- durable mandatory evidence;
- Redis deny-cache publication and repair.

Password, TOTP and WebAuthn factor verification remain separate credential authorities. Cookies are not authority: they are published only after the durable tuple commits.

## Admission contract

All production login paths follow the same order:

1. verify the authentication factor;
2. sign access and refresh material in memory;
3. derive server-owned tenant, principal, actor and one-way device evidence;
4. commit one PostgreSQL transaction containing:
   - known-device upsert;
   - refresh-token row;
   - access-session row;
   - refresh-family/refresh-token/known-device bindings;
   - append-only `session.issue` evidence;
5. publish HttpOnly cookies only after the transaction succeeds.

A duplicate access JTI, duplicate refresh JTI, evidence rejection or database failure rolls back the entire admission tuple. No cookie may represent an uncommitted session.

Password login fails closed when the account's 2FA policy state cannot be read. Database unavailability cannot silently bypass 2FA.

## Refresh rotation contract

The route cryptographically preflights refresh claims only to prepare signed replacement material. Durable acceptance occurs inside the authority:

1. lock the old refresh row with `SELECT ... FOR UPDATE`;
2. verify subject/family binding, revocation state and expiry;
3. revoke the old refresh row;
4. insert exactly one replacement refresh row;
5. insert the next access-session row with family/token/device binding;
6. revoke superseded access sessions bound to the old refresh token;
7. enqueue Redis deny publication;
8. append `session.refresh.rotate` evidence;
9. commit;
10. publish cookies.

Concurrent rotation of one old token produces at most one replacement. A second use is treated as governed reuse, revokes the family and appends `session.refresh.reuse_detected` evidence.

## Revocation contract

`user_sessions` stores `refresh_family_id`, `refresh_token_id` and `known_device_id`.

- Exact-session revocation locks the owned access session and revokes its bound refresh family.
- Revoke-all can retain the current short-lived access token while revoking every other access session and all refresh authority.
- Logout revokes the current session/family through the same authority.
- Device removal marks the device inactive and revokes only access and refresh authority bound to that device.

Cross-principal IDs produce no mutation. Database unavailability is distinct from not-found.

## Redis deny cache and outbox

PostgreSQL is the revocation authority. Redis is the low-latency deny cache.

Every revoked, unexpired access JTI is inserted into `session_revocation_outbox` in the same PostgreSQL transaction as revocation and evidence. After commit, the publisher attempts Redis writes and marks rows `published`. When Redis or the outbox-status update is unavailable, the route reports `denyCachePending: true`; durable revocation remains committed and strict session checks continue to deny through PostgreSQL.

Repair command:

```bash
npm run auth:session-revocations:repair
```

The command republishes pending, unexpired JTIs and exits nonzero while part of the selected batch remains pending. It is safe to run repeatedly.

## Mandatory evidence

Actions:

- `session.issue`
- `session.refresh.rotate`
- `session.refresh.reuse_detected`
- `session.revoke`
- `session.revoke_all`
- `session.logout`
- `device.rename`
- `device.remove`

Resources:

- `auth_session`
- `refresh_family`
- `known_device`

Evidence contains bounded policy values and domain-separated one-way fingerprints. It must never contain:

- access or refresh tokens;
- cookie values;
- raw session/refresh JTIs;
- raw IP addresses;
- user-agent/device-info strings;
- password, TOTP or passkey material;
- unrestricted request bodies.

## Failure semantics

- Signing/preparation failure: no database mutation, no cookie.
- Admission/evidence failure: full transaction rollback, no cookie.
- Rotation conflict/reuse: no second replacement; family revocation and incident evidence commit atomically.
- Redis failure after durable revocation: mutation remains committed, outbox remains pending, response exposes `denyCachePending`.
- Device/session registry database failure: truthful `503`, never an empty list or ordinary not-found.

## Permanent gates

The release gate includes:

- canonical migration and idempotency checks;
- source guards preventing route-side split issuance/revocation and best-effort audit authority;
- PostgreSQL rollback, uniqueness, race, replay and cross-principal tests;
- Redis-outage/outbox-repair tests;
- exact API Security Manifest reviewed deltas;
- TypeScript, ESLint, full suite, production build and runtime smoke on one unchanged head.

## Residual boundaries

This slice does not claim platform-wide tenant-schema completion. Canonical tenant columns and composite tenant/principal constraints remain owned by #109 and #20. Financial, custody, Admin and risk mutation evidence remain open under #161.
