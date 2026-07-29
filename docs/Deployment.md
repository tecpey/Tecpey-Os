# TecPey production deployment

This document is an entry point, not a second deployment authority. The
canonical operational contract is
[`docs/operations/PRODUCTION_DEPLOYMENT_CONTRACT.md`](operations/PRODUCTION_DEPLOYMENT_CONTRACT.md),
and the Ubuntu operator procedure is
[`DEPLOY_UBUNTU_24_PRODUCTION.md`](../DEPLOY_UBUNTU_24_PRODUCTION.md).

## Approved release path

Production releases use the reviewed container image by immutable digest. The
host must already have Docker Engine and the Compose plugin from the approved
infrastructure baseline; repository scripts do not install privileged host
dependencies.

```bash
export TECPEY_IMAGE_DIGEST='sha256:REVIEWED_RELEASE_DIGEST'
export POSTGRES_PASSWORD='SECRET_FROM_APPROVED_MANAGER'
export REDIS_PASSWORD='SECRET_FROM_APPROVED_MANAGER'
docker compose -f docker-compose.production.yml up -d
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health
```

Retain the exact image digest, migration result, readiness response, rollback
evidence, and recovery-drill artifact for the release record. Do not deploy
from a mutable tag or a live source checkout.

## Retired host paths

Repository-owned privileged bootstrap and PM2 deployment are retired. The
legacy scripts remain only as fail-closed compatibility sentinels:

```bash
bash scripts/ubuntu24-install-base.sh
bash scripts/ubuntu24-deploy-pm2.sh
```

Both commands must exit non-zero. A pre-provisioned systemd host may use the
audited unit only under infrastructure ownership and the verification contract
described in the Ubuntu operator procedure.
