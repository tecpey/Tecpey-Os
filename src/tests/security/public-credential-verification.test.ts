import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createPublicCredentialId,
  normalizePublicCredentialId,
  publicCredentialVerificationPath,
} from "../../lib/public-credential-verification-id";

const ROOT = path.resolve(import.meta.dirname, "../../..");

describe("Public credential verification", () => {
  it("derives a stable opaque identifier without accepting malformed ledger ids", () => {
    const internalId = "00000000-0000-4000-8000-000000000010";
    const publicId = createPublicCredentialId(internalId);
    assert.match(publicId ?? "", /^[0-9a-f]{24}$/);
    assert.equal(createPublicCredentialId(internalId.toUpperCase()), publicId);
    assert.equal(createPublicCredentialId("not-a-uuid"), null);
    assert.equal(normalizePublicCredentialId(`${publicId}00`), null);
    assert.equal(normalizePublicCredentialId(publicId?.toUpperCase() ?? ""), publicId);
  });

  it("builds only bounded verification paths", () => {
    const credentialId = createPublicCredentialId("00000000-0000-4000-8000-000000000010")!;
    assert.equal(
      publicCredentialVerificationPath({ profileIdentifier: "profile-1", credentialId }),
      `/student/profile-1/credential/${credentialId}`,
    );
    assert.equal(publicCredentialVerificationPath({ profileIdentifier: "../private", credentialId }), null);
  });

  it("keeps verification live, consent-bound and non-indexable when invalid", async () => {
    const page = await readFile(
      path.join(ROOT, "src/app/student/[studentId]/credential/[credentialId]/page.tsx"),
      "utf8",
    );
    const notFound = await readFile(
      path.join(ROOT, "src/app/student/[studentId]/credential/[credentialId]/not-found.tsx"),
      "utf8",
    );
    assert.match(page, /export const dynamic = "force-dynamic"/);
    assert.match(page, /getPublicProfile\(profileIdentifier\)/);
    assert.match(page, /profile\?\.publicCredentials\.find/);
    assert.match(page, /if \(!result\) notFound\(\)/);
    assert.match(page, /robots: \{ index: false, follow: false \}/);
    assert.match(page, /QRCode\.toDataURL\(verificationUrl/);
    assert.doesNotMatch(page, /credential\.code|credential\.evidence|internalId/);
    assert.match(notFound, /لغو، منقضی، تعلیق یا از حالت عمومی خارج شده/);
  });
});
