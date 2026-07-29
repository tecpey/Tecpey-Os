// AWS CloudHSM Provider — Phase 39
// Adapter for AWS CloudHSM v2 (JCE/PKCS#11 via AWS SDK or PKCS#11 daemon).
//
// Production setup:
//   AWS_CLOUDHSM_CLUSTER_ID env var → cluster endpoint from SSM Parameter Store
//   PKCS#11 daemon runs as sidecar; JCE provider loaded at JVM startup
//   OR: AWS CloudHSM SDK v3 (Node.js bindings) when available
//
// This adapter uses AWS Secrets Manager to retrieve HSM pin + endpoint,
// then delegates actual signing to the PKCS#11 daemon via HTTP proxy
// (real-world production pattern for Node.js + CloudHSM).

import { logger } from "@/lib/logger";
import type { ChainId } from "../types";
import type { HsmHealth, HsmKeyHandle, HsmProvider, HsmSignRequest, HsmSignResponse } from "./types";

const PROVIDER_NAME = "aws-cloudhsm";

type CloudHsmConfig = {
  clusterId: string;
  endpoint: string;             // PKCS#11 proxy endpoint
  partition: string;
  cryptoUserPin: string;        // never logged
};

function getConfig(): CloudHsmConfig | null {
  const clusterId = process.env.AWS_CLOUDHSM_CLUSTER_ID;
  const endpoint = process.env.AWS_CLOUDHSM_PKCS11_ENDPOINT;
  const partition = process.env.AWS_CLOUDHSM_PARTITION ?? "default";
  const pin = process.env.AWS_CLOUDHSM_CRYPTO_USER_PIN;

  if (!clusterId || !endpoint || !pin) return null;
  return { clusterId, endpoint, partition, cryptoUserPin: pin };
}

export class AwsCloudHsmProvider implements HsmProvider {
  readonly name = PROVIDER_NAME;

  async healthCheck(): Promise<HsmHealth> {
    const config = getConfig();
    if (!config) {
      return { status: "offline", provider: PROVIDER_NAME, keyCount: 0, lastCheckAt: new Date(), errorMessage: "AWS CloudHSM not configured" };
    }

    try {
      // In production: ping the PKCS#11 proxy endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(`${config.endpoint}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Health probe returned ${res.status}`);
      return { status: "connected", provider: PROVIDER_NAME, keyCount: 0, lastCheckAt: new Date() };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[hsm:aws] health check failed", { error: msg });
      return { status: "offline", provider: PROVIDER_NAME, keyCount: 0, lastCheckAt: new Date(), errorMessage: msg };
    }
  }

  async listKeys(): Promise<HsmKeyHandle[]> {
    const config = getConfig();
    if (!config) return [];
    try {
      const res = await fetch(`${config.endpoint}/keys`, {
        headers: { "X-HSM-Partition": config.partition },
      });
      if (!res.ok) return [];
      const json = await res.json() as { keys: Array<{ id: string; type: string; label: string }> };
      return json.keys.map((k) => ({
        id: k.id,
        type: k.type === "EC_SECP256K1" ? "secp256k1" : k.type === "ED25519" ? "ed25519" : "secp256k1",
        createdAt: new Date(),
      }));
    } catch {
      return [];
    }
  }

  async getKey(chainId: ChainId): Promise<HsmKeyHandle | null> {
    const keyLabel = `TECPEY_${chainId.toUpperCase()}_KEY`;
    const config = getConfig();
    if (!config) return null;

    try {
      const res = await fetch(
        `${config.endpoint}/keys/${encodeURIComponent(keyLabel)}`,
        { headers: { "X-HSM-Partition": config.partition } },
      );
      if (!res.ok) return null;
      const json = await res.json() as { id: string; type: string };
      return {
        id: json.id,
        type: json.type === "ED25519" ? "ed25519" : "secp256k1",
        chainId,
        createdAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  async getPublicKey(handle: HsmKeyHandle): Promise<Buffer> {
    const config = getConfig();
    if (!config) throw new Error("AWS CloudHSM not configured");

    const res = await fetch(`${config.endpoint}/keys/${handle.id}/public`, {
      headers: { "X-HSM-Partition": config.partition },
    });
    if (!res.ok) throw new Error(`CloudHSM getPublicKey failed: ${res.status}`);
    const json = await res.json() as { publicKeyHex: string };
    return Buffer.from(json.publicKeyHex, "hex");
  }

  async sign(request: HsmSignRequest): Promise<HsmSignResponse> {
    const config = getConfig();
    if (!config) throw new Error("AWS CloudHSM not configured");

    const res = await fetch(`${config.endpoint}/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-HSM-Partition": config.partition,
      },
      body: JSON.stringify({
        keyId: request.keyHandle.id,
        algorithm: request.algorithm,
        data: request.data.toString("base64"),
      }),
    });

    if (!res.ok) {
      throw new Error(`CloudHSM sign failed: ${res.status}`);
    }

    const json = await res.json() as { signatureHex: string };
    return {
      signature: Buffer.from(json.signatureHex, "hex"),
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
