export const ADMIN_AUTH_ENV_SECRET_NAMES = [
  "TECPEY_ADMIN_SESSION_SECRET",
  "TECPEY_2FA_SECRET",
  "TECPEY_ADMIN_TOKEN",
] as const;

type SecretFactory = (label: string) => string;
type AdminAuthEnvName = (typeof ADMIN_AUTH_ENV_SECRET_NAMES)[number];

export function adminAuthEnvFixture(
  secret: SecretFactory,
): Record<AdminAuthEnvName, string> {
  return {
    TECPEY_ADMIN_SESSION_SECRET: secret("admin-session"),
    TECPEY_2FA_SECRET: secret("totp-encryption"),
    TECPEY_ADMIN_TOKEN: secret("admin-bootstrap"),
  };
}
