# TecPey Public Browser Golden Path

**Status:** Controlled soft-launch acceptance boundary  
**Owner:** #254 / parent #80  
**Scope:** Public education and Trading Arena discovery only

## Proven journey

The browser suite verifies Persian RTL and English LTR public navigation in Chromium and Firefox at desktop and mobile widths. Five behavioral scenarios run across four governed browser/viewport projects, producing twenty exact-head checks. It covers:

- persisted Light/Dark choice through the rendered `html` authority;
- desktop and mobile Knowledge Center keyboard behavior, focus return and localized Arena discovery;
- canonical Exchange login/signup destinations without malformed or doubled origins;
- Academy and protected Arena route behavior in Persian and English;
- Footer visibility when `IntersectionObserver` is unavailable;
- horizontal overflow and fixed-control reachability;
- truthful public claims and education-first metadata.

## Mentor authority and degraded behavior

Exactly one Mentor launcher may be visible for a resolved account state:

- a user with no Academy profile receives the public educational onboarding launcher;
- a profile-ready learner receives the personalized Global Mentor launcher;
- an unavailable, malformed or non-successful profile response displays neither launcher.

The public profile response is parsed strictly and fails closed. A service outage must never be interpreted as an absent profile. Personalized Mentor data is available only after canonical Academy profile readiness. Browser tests independently prove absent-profile, profile-ready and dependency-unavailable boundaries without production user data.

## Authority and privacy

Browser tests use isolated public API responses, a temporary PostgreSQL database and Redis service. They contain no production credentials, user records or staging access and do not authorize financial capability. Public ranking, rewards, Instructor access and real custody remain disabled.

The Browser workflow executes clean migrations, a production build and the governed custom server with custody explicitly disabled. This proves browser behavior on the production runtime path; it is not staging or production-host evidence.

## Truthful product boundary

The public surface and structured metadata must not claim unconditional 24/7 support, an ungoverned online state, an active production-certified exchange or real-money availability. Financial services are presented only as available after their own operational, compliance and release evidence is approved.

## Evidence rule

`npm run browser:check` protects the source contract. `npm run test:browser` executes browser behavior. A green build or static text scan alone is not browser acceptance. On failure, the workflow preserves the source-authority output, migration/build logs, custom-server log, rendered root HTML, Playwright traces, screenshots and video for a short diagnostic window. Successful runs publish no user or environment data.
