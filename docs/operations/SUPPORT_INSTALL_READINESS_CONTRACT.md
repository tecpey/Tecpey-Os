# TecPey Support Install Readiness Contract

This contract governs the source-zip exception path used when TecPey has no
direct server or staging access and an approved infrastructure/support team will
install the package from a received zip.

Source-zip delivery remains an exception. It does not replace the preferred
immutable container digest path and does not authorize production launch by
itself.

## Clean-Room Install Rehearsal

Before sending a zip to support, the release owner must run a clean-room package
rehearsal from the artifact directory:

```bash
npm run support:install:rehearse -- tecpey-deployment-RELEASE_SHA.zip tecpey-deployment-RELEASE_SHA.zip.sha256
```

No staging or server access is required for this rehearsal.

The rehearsal verifies the detached checksum, unpacks the bundle into an
isolated temporary candidate directory, checks that production secrets and live
build artifacts are absent, and validates the support runbook command order.
This rehearsal does not run build, migration, runtime, database, Redis, or Nginx
commands.

The rehearsal must pass before the bundle is sent to support. If it fails, the
zip is not install-ready.

## Support Recipient Order

Support must keep this order:

1. Verify the detached checksum.
2. Unpack into an isolated candidate path, never the live path.
3. Create `.env.production` privately from `.env.production.example`.
4. Run candidate build verification.
5. Run migration verification.
6. Promote or restart only through the approved infrastructure procedure.
7. Run runtime readiness verification.
8. Return only non-secret evidence.

The canonical commands are documented in
`docs/operations/SUPPORT_TEAM_DEPLOYMENT_HANDOFF.md`.

## Evidence Boundary

Accepted evidence may include checksum output, release SHA, command exit
summaries, health JSON with secrets redacted, service status summaries, Nginx
configuration test output, and scheduler/timer verifier summaries.

Evidence must not include `.env.production`, private keys, access tokens,
database dumps, user data, or raw logs containing secrets or PII.

Production launch remains `NO_GO` until support-returned evidence is reviewed
against the controlled launch gates.
