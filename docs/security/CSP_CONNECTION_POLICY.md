# CSP Connection Policy

## Authority

`src/lib/security/csp-connection-policy.ts` is the single code authority for
browser `connect-src` configuration. It is consumed by both:

- `src/proxy.ts`, which emits the per-request CSP header; and
- `scripts/run-production-bootstrap.ts`, which rejects an invalid production
  connection boundary before migrations or the HTTP server start.

`npm run env:check` invokes the same typed authority through
`scripts/validate-csp-connection-env.ts`.

Production has no scheme-level fallback. Missing or invalid required origins
stop validation and runtime bootstrap.

## Production contract

| Variable | Required | Accepted value | Owner | Browser purpose |
|---|---:|---|---|---|
| `NEXT_PUBLIC_API_BACKEND_URL` | Yes | One exact `https://` origin; no credentials, path, query, fragment, whitespace or placeholder | Platform API | Browser calls to the TecPey application/API boundary |
| `NEXT_PUBLIC_API_SOCKET_URL` | Yes | One `wss://` URL; the CSP authority normalizes it to its exact origin | Realtime Platform | Authenticated and public market-data WebSocket transport |
| `NEXT_PUBLIC_EXTRA_CONNECT_SRC` | No | Space-separated exact `https://` or `wss://` origins only | Platform Security plus integration owner | Explicitly reviewed browser integrations |

The following are deliberately not browser connection authorities:

| Integration class | Current policy | Owner | Reason |
|---|---|---|---|
| AI model providers | No direct browser origin | AI Platform | Provider traffic and credentials remain server-side |
| Analytics/advertising | No origin approved | Product + Privacy + Platform Security | No browser analytics integration has completed privacy and security review |
| Customer support/chat widgets | No origin approved | Support + Privacy + Platform Security | No browser widget is currently authorized |
| Arbitrary wildcard or scheme source | Prohibited | Platform Security | Would expand exfiltration authority beyond an owned origin |

Any new extra origin requires a reviewed code change to this registry identifying
its exact origin, business purpose, data classification, owner and removal plan.
Changing the deployment variable alone is not approval.

The `NEXT_PUBLIC_*` connection values must be identical at build and runtime.
Next.js exposes these values to browser bundles at build time, while the
server-side CSP authority intentionally reads them dynamically at runtime.
Deployments must rebuild when either public endpoint changes and must run
`npm run env:check` before promotion.

## Development policy

Development may use explicitly configured `http://` and `ws://` origins.
When both endpoint variables are absent, the only fallback sources are exact
loopback host patterns for `localhost` and `127.0.0.1`. Broad `http:`,
`https:`, `ws:`, `wss:` and `*` sources are never emitted.

Production rejects plaintext `http://` and `ws://`, including loopback values.
Production-mode browser tests therefore use reserved `.test` HTTPS/WSS origins
and route interception rather than weakening the live policy.

## Violation observability and privacy

The governed Browser Golden Path observes the browser's
`securitypolicyviolation` event and retains only the effective directive,
disposition and blocked origin or safe CSP token. A violation fails the browser
run without recording the document URL, path, query, fragment, source file,
script sample, cookies or user/account data.

A central production report receiver is deliberately not enabled in this
change. Adding a new public POST route would change the immutable API Security
Manifest baseline, and sending raw browser reports to an unapproved third party
could disclose page URLs or script samples. Platform Security and Privacy must
approve a bounded, rate-limited, manifest-governed receiver and its retention
policy before `report-uri` or `report-to` is enabled.

For a future policy expansion, staging may temporarily add an ingress-level
`Content-Security-Policy-Report-Only` header pointing only to that approved
receiver. It must not replace or broaden the enforced application policy.

## Verification

Run:

```bash
npm run env:check
npm run test -- --test-name-pattern CSP
npm run build
npm run ui:runtime:prod
```

For a deployed host, inspect the response and confirm `connect-src` contains
only owned exact origins:

```bash
curl -sSI https://tecpey.ir/ | tr -d '\r' | grep -i content-security-policy
```
