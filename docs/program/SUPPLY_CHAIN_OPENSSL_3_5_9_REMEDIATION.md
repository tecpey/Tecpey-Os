# Supply-chain OpenSSL 3.5.9 remediation

## Problem

The production Alpine runtime was pinned to `libcrypto3=3.5.8-r0` and `libssl3=3.5.8-r0`. Alpine v3.24 advanced the live repository packages, causing the exact package install to fail during the container build and preventing SBOM, vulnerability and rollback evidence from being produced.

## Remediation contract

- Preserve the digest-pinned Node Alpine base image.
- Preserve exact package-version pinning; do not fall back to mutable package names.
- Pin both OpenSSL runtime packages to `3.5.9-r0` consistently across Dockerfile and supply-chain policy guards.
- Keep negative tests that reject unpinned OpenSSL installs and runtime-stage bypasses.
- Require exact-head container build, minimal rootless runtime verification, SPDX SBOM generation, HIGH/CRITICAL vulnerability rejection, rollback/volume-restore proof and immutable artifact upload.
- Do not weaken upload failures or evidence checks to make CI pass.

## Scope

This remediation is repository-wide supply-chain maintenance and must remain independent of product-feature PRs such as Mentor Rive v2.
