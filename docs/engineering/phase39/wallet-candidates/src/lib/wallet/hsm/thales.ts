// Thales HSM Provider — Phase 39
// Adapter for Thales Luna Network HSM (formerly SafeNet).
//
// Production setup:
//   THALES_HSM_HOST env var → Luna HSM appliance hostname
//   THALES_HSM_PARTITION → partition label (slot)
//   THALES_HSM_CRYPTO_OFFICER_PIN → CO pin (never logged)
//   Communicates via PKCS#11 over Thales Network HSM client library
//
// This adapter wraps the Thales REST Proxy (if configured) or falls back
// to a native PKCS#11 daemon proxy endpoint pattern (same as CloudHSM).

import { logger } from "@/lib/logger";
import type { ChainId } from "../types";
import type { HsmHealth, HsmKeyHandle, HsmProvider, HsmSignRequest, HsmSignResponse } from "./types";

const PROVIDER_NAME = "thales-luna";

type ThalesConfig = {
  host: string;
  port: number;
  partition: string;
  pin: string;            // never logged
  proxyEndpoint: string;  // Thales REST proxy or PKCS11 daemon
};

function getConfig(): ThalesConfig | null {
  const host = process.env.THALES_HSM_HOST;
  const partition = process.env.THALES_HSM_PARTITION;
  const pin = process.env.THALES_HSM_CRYPTO_OFFICER_PIN;
  const proxyEndpoint = process.env.THALES_HSM_PROXY_ENDPOINT;

  if (!host || !partition || !pin || !proxyEndpoint) return null;

  return {
    host,
    port: parseInt(process.env.THALES_HSM_PORT ?? "1792", 10),
    partition,
    pin,
    proxyEndpoint,
  };
}

export class ThalesHsmProvider implements HsmProvider {
  readonly name = PROVIDER_NAME;

  async healthCheck(): Promise<HsmHealth> {
    const config = getConfig();
    if (!config) {
      return { status: "offline", provider: PROVIDER_NAME, keyCount: 0, lastCheckAt: new Date(), errorMessage: "Thales HSM not configured" };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(`${config.proxyEndpoint}/partition/${encodeURIComponent(config.partition)}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`Health probe ${res.status}`);
      return { status: "connected", provider: PROVIDER_NAME, keyCount: 0, lastCheckAt: new Date() };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[hsm:thales] health check failed", { error: msg });
      return { status: "offline", provider: PROVIDER_NAME, keyCount: 0, lastCheckAt: new Date(), errorMessage: msg };
    }
  }

  async listKeys(): Promise<HsmKeyHandle[]> {
    const config = getConfig();
    if (!config) return [];

    try {
      const res = await fetch(`${config.proxyEndpoint}/partition/${encodeURIComponent(config.partition)}/keys`);
      if (!res.ok) return [];
      const json = await res.json() as { objects: Array<{ handle: string; class: string; label: string }> };
      return json.objects
        .filter((o) => o.class === "CKO_PRIVATE_KEY" || o.class === "CKO_PUBLIC_KEY")
        .map((o) => ({
          id: o.handle,
          type: "secp256k1" as const,
          createdAt: new Date(),
        }));
    } catch {
      return [];
    }
  }

  async getKey(chainId: ChainId): Promise<HsmKeyHandle | null> {
    const config = getConfig();
    if (!config) return null;

    const label = `TECPEY_${chainId.toUpperCase()}`;
    try {
      const res = await fetch(
        `${config.proxyEndpoint}/partition/${encodeURIComponent(config.partition)}/keys?label=${encodeURIComponent(label)}`,
      );
      if (!res.ok) return null;
      const json = await res.json() as { objects: Array<{ handle: string; class: string }> };
      const key = json.objects.find((o) => o.class === "CKO_PRIVATE_KEY");
      if (!key) return null;
      return {
        id: key.handle,
        type: chainId === "solana" ? "ed25519" : "secp256k1",
        chainId,
        createdAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  async getPublicKey(handle: HsmKeyHandle): Promise<Buffer> {
    const config = getConfig();
    if (!config) throw new Error("Thales HSM not configured");

    const res = await fetch(
      `${config.proxyEndpoint}/partition/${encodeURIComponent(config.partition)}/keys/${handle.id}/public-value`,
    );
    if (!res.ok) throw new Error(`Thales getPublicKey failed: ${res.status}`);
    const json = await res.json() as { value: string };
    return Buffer.from(json.value, "base64");
  }

  async sign(request: HsmSignRequest): Promise<HsmSignResponse> {
    const config = getConfig();
    if (!config) throw new Error("Thales HSM not configured");

    const res = await fetch(`${config.proxyEndpoint}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partition: config.partition,
        keyHandle: request.keyHandle.id,
        mechanism: request.algorithm === "EDDSA" ? "CKM_EDDSA" : "CKM_ECDSA",
        data: request.data.toString("base64"),
      }),
    });

    if (!res.ok) throw new Error(`Thales sign failed: ${res.status}`);
    const json = await res.json() as { signature: string };

    return {
      signature: Buffer.from(json.signature, "base64"),
      keyId: request.keyHandle.id,
      timestamp: new Date(),
    };
  }

  async getAddress(handle: HsmKeyHandle): Promise<string> {
    const pubKey = await this.getPublicKey(handle);
    const { deriveAddressFromPublicKey } = await import("../address/derivation");
    return deriveAddressFromPublicKey(pubKey, handle.chainId ?? "ethereum");
  }
}
