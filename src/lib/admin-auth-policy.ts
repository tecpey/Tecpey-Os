export type AdminAuthenticationModes = Readonly<{
  passwordTotp: true;
  passkey: boolean;
  manualTotpEnrollment: true;
}>;

export function adminAuthenticationModes(): AdminAuthenticationModes {
  return {
    passwordTotp: true,
    passkey: process.env.TECPEY_ADMIN_PASSKEY_ENABLED === "true" ||
      (process.env.NODE_ENV === "test" && process.env.TECPEY_ADMIN_PASSKEY_ENABLED === undefined),
    manualTotpEnrollment: true,
  };
}

export function customerPasskeysEnabled(): boolean {
  return process.env.TECPEY_CUSTOMER_PASSKEY_ENABLED === "true" ||
    (process.env.NODE_ENV === "test" && process.env.TECPEY_CUSTOMER_PASSKEY_ENABLED === undefined);
}
