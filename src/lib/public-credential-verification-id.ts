import { createHash } from "node:crypto";

const INTERNAL_CREDENTIAL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_CREDENTIAL_ID_PATTERN = /^[0-9a-f]{24}$/;
const PUBLIC_PROFILE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

export function createPublicCredentialId(internalId: string): string | null {
  const normalized = String(internalId ?? "").trim().toLowerCase();
  if (!INTERNAL_CREDENTIAL_ID_PATTERN.test(normalized)) return null;
  return createHash("sha256")
    .update("tecpey-public-credential-v1\0")
    .update(normalized)
    .digest("hex")
    .slice(0, 24);
}

export function normalizePublicCredentialId(value: string): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return PUBLIC_CREDENTIAL_ID_PATTERN.test(normalized) ? normalized : null;
}

export function normalizePublicProfileIdentifier(value: string): string | null {
  const normalized = String(value ?? "").trim().replace(/^@/, "");
  return PUBLIC_PROFILE_IDENTIFIER_PATTERN.test(normalized) ? normalized : null;
}

export function publicCredentialVerificationPath(input: {
  profileIdentifier: string;
  credentialId: string;
}): string | null {
  const profileIdentifier = normalizePublicProfileIdentifier(input.profileIdentifier);
  const credentialId = normalizePublicCredentialId(input.credentialId);
  if (!profileIdentifier || !credentialId) return null;
  return `/student/${encodeURIComponent(profileIdentifier)}/credential/${credentialId}`;
}
