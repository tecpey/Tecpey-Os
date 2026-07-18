export type PublicKeyCredentialDescriptorJSON = {
  type: "public-key";
  id: string;
  transports?: AuthenticatorTransport[];
};

export type AdminRegistrationOptionsJSON = {
  challenge: string;
  rp: PublicKeyCredentialRpEntity;
  user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  excludeCredentials?: PublicKeyCredentialDescriptorJSON[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
  extensions?: AuthenticationExtensionsClientInputs;
};

export type AdminAuthenticationOptionsJSON = {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: PublicKeyCredentialDescriptorJSON[];
  userVerification?: UserVerificationRequirement;
  extensions?: AuthenticationExtensionsClientInputs;
};

export type RegistrationCredentialJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    attestationObject: string;
  };
  transports: string[];
};

export type AuthenticationCredentialJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
};

function requireBrowserEncoding(): void {
  if (typeof atob !== "function" || typeof btoa !== "function") {
    throw new Error("passkey_browser_encoding_unavailable");
  }
}

export function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  requireBrowserEncoding();
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid_base64url");

  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export function bufferSourceToBase64Url(value: BufferSource): string {
  requireBrowserEncoding();
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function registrationOptionsFromJSON(
  input: AdminRegistrationOptionsJSON,
): PublicKeyCredentialCreationOptions {
  return {
    ...input,
    challenge: base64UrlToArrayBuffer(input.challenge),
    user: {
      ...input.user,
      id: base64UrlToArrayBuffer(input.user.id),
    },
    excludeCredentials: input.excludeCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToArrayBuffer(credential.id),
    })),
  };
}

export function authenticationOptionsFromJSON(
  input: AdminAuthenticationOptionsJSON,
): PublicKeyCredentialRequestOptions {
  return {
    ...input,
    challenge: base64UrlToArrayBuffer(input.challenge),
    allowCredentials: input.allowCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToArrayBuffer(credential.id),
    })),
  };
}

export function serializeRegistrationCredential(
  credential: PublicKeyCredential,
): RegistrationCredentialJSON {
  const response = credential.response;
  if (!(response instanceof AuthenticatorAttestationResponse)) {
    throw new Error("invalid_registration_credential");
  }

  return {
    id: credential.id,
    rawId: bufferSourceToBase64Url(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: bufferSourceToBase64Url(response.clientDataJSON),
      attestationObject: bufferSourceToBase64Url(response.attestationObject),
    },
    transports: typeof response.getTransports === "function"
      ? response.getTransports()
      : [],
  };
}

export function serializeAuthenticationCredential(
  credential: PublicKeyCredential,
): AuthenticationCredentialJSON {
  const response = credential.response;
  if (!(response instanceof AuthenticatorAssertionResponse)) {
    throw new Error("invalid_authentication_credential");
  }

  return {
    id: credential.id,
    rawId: bufferSourceToBase64Url(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: bufferSourceToBase64Url(response.clientDataJSON),
      authenticatorData: bufferSourceToBase64Url(response.authenticatorData),
      signature: bufferSourceToBase64Url(response.signature),
      ...(response.userHandle
        ? { userHandle: bufferSourceToBase64Url(response.userHandle) }
        : {}),
    },
  };
}

export function passkeySupported(): boolean {
  return typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function";
}
