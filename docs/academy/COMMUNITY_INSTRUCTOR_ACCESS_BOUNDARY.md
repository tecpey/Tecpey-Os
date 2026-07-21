# Community Instructor Access Boundary

Issue: #250  
Parent: #160  
Policy version: `community-instructor-access-boundary-v1`  
Status: **Launch-disabled / no active Instructor access authority**

## Current product truth

The route:

```text
/academy/community/instructor
```

is an unavailable informational boundary. It does not authenticate an Instructor, list students, load a student profile or disclose behavioral, Arena, journal, challenge, reputation or Academy evidence.

The route is also excluded from the shared root-chrome profile lookup. A trusted pathname header is overwritten by the server proxy, and `getProfileInfo()` returns before session or `/dashboard/profile` access for this exact route. A client-supplied header cannot opt another route out of profile loading because the proxy always replaces it.

The existing private endpoint:

```text
/api/behavioral-snapshot
```

is a self-view authority for the currently authenticated student. It is not an Instructor API and must not be used as a substitute for an Instructor role or student disclosure grant.

## Consent is not a grant

The Community profile field `instructor_review_consent` records a user preference boundary only. It cannot independently:

- create an Instructor identity;
- assign an Instructor to a student;
- authorize cross-user reads;
- establish tenant or program membership;
- define purpose, scope or expiry;
- prove access occurred.

A future Instructor grant must require both verified role authority and an explicit student-to-Instructor authorization record.

## Dormant compatibility component

```text
src/components/academy/community/InstructorDashboard.tsx
```

is quarantined compatibility code and has zero active source importers. It may not be mounted by the Instructor route or another production page.

It remains temporarily because the existing Social/Arena boundary guard still inspects its historical self-view implementation. Removal requires a separate bounded cleanup that migrates that guard and proves zero references and build safety.

Dormant code is not product capability.

## Future activation requirements

A real Instructor surface requires a new P0 architecture and privacy review covering:

1. verified Instructor/staff role;
2. institution, tenant and authorized-program membership;
3. explicit student-to-Instructor grant;
4. grant purpose and minimum-necessary scope;
5. issue, expiry and revocation timestamps from PostgreSQL;
6. strict same-tenant/program isolation;
7. independent student consent distinct from public-profile visibility and private self analytics;
8. role/grant outage behavior that fails closed;
9. revisioned and idempotent grant/revoke commands;
10. transaction-coupled grant, revoke and access evidence;
11. access receipts and Security/Privacy review capability;
12. bounded, pseudonymous or minimized data projection;
13. prohibition of raw PnL, balances, order size, trade IDs, exact private timestamps, contact data, credentials and unrestricted reflection text;
14. no hidden scoring, reward, scholarship, Mentor or disciplinary outcome;
15. retention, account-deletion and legal-hold behavior;
16. API Security Manifest registration, PostgreSQL isolation tests and runtime evidence.

## Active route restrictions

Until the future authority is approved, the Instructor page must:

- remain a server-rendered static unavailable page;
- use `noindex, nofollow` metadata;
- avoid all Instructor-dashboard claims;
- perform no behavioral/profile/Arena/journal/challenge/reputation API request;
- be excluded from shared root-chrome session/profile retrieval before those reads begin;
- import no client state or browser persistence module;
- provide only safe navigation back to Community and Academy;
- state that private self insights are not disclosed to an Instructor.

## Permanent CI boundary

Protected CI fails when:

- the active route imports `InstructorDashboard`;
- the active route imports or calls the behavioral snapshot client/API;
- the route becomes a client component;
- browser persistence or user evidence modules are introduced;
- the trusted request-route header is not overwritten by the proxy;
- `getProfileInfo()` does not return before `getSession()` and `apiFetch()` for the exact Instructor route;
- another route can self-declare itself profile-free through an untrusted client header;
- the dormant dashboard gains an active source importer;
- metadata loses the noindex/nofollow boundary;
- copy implies that an Instructor role or student grant already exists;
- Social/Arena inventory stops classifying the route as launch-disabled and the dashboard as dormant.

## Non-goals

- no Instructor role implementation;
- no student roster or search;
- no cross-user behavioral projection;
- no change to the private behavioral snapshot endpoint;
- no leaderboard, score, reward, scholarship or Mentor decision;
- no deletion of the dormant compatibility component in this slice;
- no claim that parent #160 is complete.
