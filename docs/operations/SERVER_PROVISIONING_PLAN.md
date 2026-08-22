# Staging and Soft-Launch Server Provisioning Plan

**Status:** planning document. It records no evidence, grants no approval, and
does not move the launch decision, which remains NO-GO. See
`docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md`.

## 1. What the repository actually requires

Every figure below is taken from the tracked contracts, not from general advice.

| Requirement | Source |
|---|---|
| Ubuntu 24.04 LTS | `DEPLOY_UBUNTU_24_PRODUCTION.md` §1 |
| 4 vCPU / 8 GB RAM minimum; 8 vCPU / 16 GB recommended | same |
| NVMe SSD | same |
| Docker Engine + Compose plugin, provisioned externally | same — the repo refuses to run privileged installers |
| Node.js major 22, npm major 10 | `scripts/ubuntu24-preflight.sh` version contracts |
| PostgreSQL + authenticated Redis, Redis never publicly exposed | `docker-compose.production.yml`, `DEPLOY_UBUNTU_24_PRODUCTION.md` §7 |
| Nginx + certbot for TLS | `DEPLOY_UBUNTU_24_PRODUCTION.md` §4, `deploy/nginx/tecpey.conf` |
| Non-root runtime user and group | `STAGING_READINESS_EVIDENCE_CONTRACT.md` |
| GitHub self-hosted runner, labels `self-hosted, linux, x64, tecpey-staging`, inside protected Environment `staging` | `STAGING_READINESS_EVIDENCE_CONTRACT.md` |

Sizing decision: the 4/8 minimum is for a launch host alone. This machine also
runs PostgreSQL, Redis, the CI runner and both environments, so more is needed.

**Purchased: 8 vCPU / 16 GB RAM / Ubuntu 24.04, hosted in Türkiye.**

16 GB is workable rather than comfortable. Steady state across both environments
is roughly 6–9 GB; `next build` adds 2–4 GB and the Playwright browsers about
2 GB, which would exceed 16 GB if everything ran at once. **Staging therefore
runs on demand, not continuously** — its containers come up for evidence
collection and go down afterwards. Production stays up. If staging is later left
running around the clock, RAM has to grow before that happens, not after the
first out-of-memory build.

## 2. Outbound dependencies — the constraint that shapes the purchase

The application calls these third parties at runtime:

| Host | Purpose | Consequence if unreachable |
|---|---|---|
| `api.openai.com` | AI Mentor | Mentor stops working. Mentor is one of the three pillars of the controlled soft-launch scope. |
| `api.resend.com` / `api.sendgrid.com` | transactional email | Every send fails. `env:check` requires a delivering provider in production. |
| `api.binance.com`, `api.coingecko.com`, `api.kraken.com`, `api.exchange.coinbase.com` | price feeds | Market data goes stale. |
| news sources (`cointelegraph.com`, `decrypt.co`, `arzdigital.com`) | news materialization | Staging news evidence cannot be collected. |
| `github.com` | self-hosted runner, checkout | No staging evidence workflow at all. |
| `registry.npmjs.org`, container registry | `npm ci`, digest-pinned image pull | No build, no deploy. |

Several of these refuse connections from Iranian IP ranges. A host inside Iran
gives the best latency to the intended audience and the simplest payment path,
but cannot reach them directly.

**There is a failure mode here worth naming precisely.** `env:check` validates
the *shape* of `EMAIL_PROVIDER` and its key, not reachability. On a host that
cannot reach the provider, the gate passes, `/api/health` reports
`email: configured`, and every send fails at runtime. That is a control
reporting a capability it does not have — the same defect class as #516, #518,
#520 and #525, arriving from the network instead of from the code.

### Resolution: host outside Iran, no relay

The host was placed in **Türkiye**, bought from an Iranian provider in rial.
That removes the constraint rather than working around it: the outbound
dependencies are expected to be directly reachable, so no egress relay is
needed, and Türkiye is geographically closer to the intended audience than a
European region would be.

**Expected, not yet verified.** Reachability is a property of the host, and this
plan does not get to assume it. Step 3 below proves each dependency answers
*from the server*, and until that output exists this section records an
expectation. A laptop reaching OpenAI says nothing about the machine that will
run the workers.

Alternatives considered and not taken, recorded so the choice stays deliberate:

- *Host inside Iran plus a small foreign egress relay.* Best user latency, one
  more moving part, and a relay outage becomes an application outage.
- *Host inside Iran with no relay.* Cheapest. Mentor and email do not work, so
  the soft-launch scope shrinks to Academy and Arena and the email requirement
  in `env:check` has to be confronted rather than worked around.

## 3. Environment separation on one host

The launch contract expects the protected staging host to be **separate** from
production. One machine has been chosen for both roles, so:

- `NOG-01` and `NOG-02` cannot be satisfied as those pillars are written. This
  is a known, accepted consequence, not an oversight, and it is not something a
  configuration can argue its way out of.
- Everything else — deployment, migrations, health, rollback drills, incident
  paths — can be exercised for real.

To keep the two roles from contaminating each other, and to make a later move to
a second host mechanical rather than archaeological:

| Concern | staging | production |
|---|---|---|
| system user | `tecpey-staging` | `tecpey` |
| application root | `/var/www/tecpey-staging` | `/var/www/tecpey` |
| environment file | `/var/www/tecpey-staging/.env.production` | `/var/www/tecpey/.env.production` |
| app port (behind Nginx) | 3100 | 3000 |
| Compose project | `tecpey-staging` | `tecpey` |
| PostgreSQL | own container, own volume | own container, own volume |
| Redis | own container, own password | own container, own password |
| ops state dir | `/var/lib/tecpey-staging/ops` | `/var/lib/tecpey/ops` |
| systemd units | `tecpey-staging-*` | `tecpey-*` |
| hostname | `staging.tecpey.ir` | `tecpey.ir`, `www.tecpey.ir` |

Separate databases and separate Redis passwords are the load-bearing part: a
shared database would let a staging drill destroy production data, which is the
exact scenario the recovery drills exist to rehearse.

## 4. Accounts to arrange before the server exists

None of these can be created from inside the repository.

- Email provider — Resend or SendGrid, with a verified sending domain for
  `tecpey.ir`. Required before a production candidate will build.
- OpenAI API key, funded.
- Alert destination — a Slack, Discord or PagerDuty webhook URL for
  `ALERT_WEBHOOK_URL`. Must be `https`; the runtime refuses anything else in
  production.
- Redis REST credentials (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
  for coordinated rate limiting.
- DNS control for `tecpey.ir`, including a `staging` record.
- A GitHub Environment named `staging` with protection rules, and a runner
  registration token.

## 5. Order of work once the machine is available

Each step is verified before the next begins. No step is marked done on the
strength of the previous one.

1. Base image, non-root users, SSH hardening, firewall. Redis and PostgreSQL
   ports closed to the outside.
2. Docker Engine + Compose plugin. Node 22 / npm 10.
3. Egress relay, and proof that `api.openai.com` and the email provider answer
   *from the application host* — not from a laptop.
4. Clone at an exact SHA. `.env.production` filled from real secrets.
5. `npm run env:check` must pass on the host, in production mode.
6. `bash scripts/ubuntu24-preflight.sh candidate`, then `migrate`, then
   `runtime`.
7. Nginx + certbot; `/api/health` returning 200 with `health=ok` through the
   public hostname.
8. Register the self-hosted runner; run the staging evidence workflow.
9. Backup and restore drill against the staging database, with reconciliation.
10. Incident readiness: fire a synthetic alert and confirm it arrives at a human.

Steps 9 and 10 produce the artifacts the launch checklist asks for. Steps 1–8
produce a running system. The two are not the same thing, and neither implies
the other.
