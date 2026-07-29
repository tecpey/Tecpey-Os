// Local Development HSM — Phase 39
// Simulates HSM behavior for local development and testing WITHOUT a real HSM.
// NEVER use in production.
//
// Security: uses a deterministic fixed seed; addresses are constant across restarts.
// Enabled only when HSM_PROVIDER=local-dev (or NODE_ENV=test).

import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign } from "crypto";
import type { ChainId } from "../types";
import type { HsmHealth, HsmKeyHandle, HsmProvider, HsmSignRequest, HsmSignResponse } from "./types";

const PROVIDER_NAME = "local-dev-hsm";

const DEV_SEEDS: Record<ChainId, string> = {
  bitcoin: "0000000000000000000000000000000000000000000000000000000000000001",
  ethereum: "0000000000000000000000000000000000000000000000000000000000000002",
  bsc: "0000000000000000000000000000000000000000000000000000000000000003",
  polygon: "0000000000000000000000000000000000000000000000000000000000000004",
  tron: "0000000000000000000000000000000000000000000000000000000000000005",
  solana: "0000000000000000000000000000000000000000000000000000000000000006",
};

export class LocalDevelopmentHsm implements HsmProvider {
  readonly name = PROVIDER_NAME;

  private guardProduction(): void {
    if (process.env.NODE_ENV === "production") {
      throw new Error("LocalDevelopmentHsm MUST NOT be used in production");
    }
  }

  async healthCheck(): Promise<HsmHealth> {
    return {
      status: "connected",
      provider: PROVIDER_NAME,
      keyCount: Object.keys(DEV_SEEDS).length,
      lastCheckAt: new Date(),
      errorMessage: "Development HSM — not for production use",
    };
  }

  async listKeys(): Promise<HsmKeyHandle[]> {
    this.guardProduction();
    return (Object.keys(DEV_SEEDS) as ChainId[]).map((chainId) => ({
      id: `dev-${chainId}`,
      type: chainId === "solana" ? "ed25519" as const : "secp256k1" as const,
      chainId,
      createdAt: new Date("2024-01-01"),
    }));
  }

  async getKey(chainId: ChainId): Promise<HsmKeyHandle | null> {
    this.guardProduction();
    if (!DEV_SEEDS[chainId]) return null;
    return {
      id: `dev-${chainId}`,
      type: chainId === "solana" ? "ed25519" : "secp256k1",
      chainId,
      createdAt: new Date("2024-01-01"),
    };
  }

  async getPublicKey(handle: HsmKeyHandle): Promise<Buffer> {
    this.guardProduction();
    const chainId = handle.chainId ?? "ethereum";
    const seed = DEV_SEEDS[chainId];
    if (!seed) throw new Error(`No dev key for ${chainId}`);

    if (chainId === "solana") {
      const privBytes = Buffer.from(seed, "hex");
      const der = buildEd25519Pkcs8Der(privBytes);
      const keyObj = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
      const pub = createPublicKey(keyObj);
      const spki = pub.export({ type: "spki", format: "der" }) as Buffer;
      return spki.slice(-32);
    }

    const { getPublicKey } = await import("@noble/secp256k1");
    const privBytes = Buffer.from(seed, "hex");
    return Buffer.from(getPublicKey(privBytes, false)); // uncompressed 65 bytes
  }

  async sign(request: HsmSignRequest): Promise<HsmSignResponse> {
    this.guardProduction();
    const chainId = request.keyHandle.chainId ?? "ethereum";
    const seed = DEV_SEEDS[chainId];
    if (!seed) throw new Error(`No dev key for ${chainId}`);

    let sig: Buffer;

    if (chainId === "solana") {
      const privBytes = Buffer.from(seed, "hex");
      const der = buildEd25519Pkcs8Der(privBytes);
      const keyObj = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
      sig = cryptoSign(null, request.data, keyObj);
    } else {
      const { signAsync } = await import("@noble/secp256k1");
      const privBytes = Buffer.from(seed, "hex");
      const rawSig = await signAsync(request.data, privBytes, { lowS: true });
      const rawWithMethods = rawSig as unknown as { toHex(): string };
      sig = Buffer.from(rawWithMethods.toHex(), "hex");
    }

    return { signature: sig, keyId: request.keyHandle.id, timestamp: new Date() };
  }

  async getAddress(handle: HsmKeyHandle): Promise<string> {
    this.guardProduction();
    const pubKey = await this.getPublicKey(handle);
    const { deriveAddressFromPublicKey } = await import("../address/derivation");
    return deriveAddressFromPublicKey(pubKey, handle.chainId ?? "ethereum");
  }
}

// ── Ed25519 PKCS8 DER wrapping (same as keystore.ts, kept local to avoid circular import) ──

function buildEd25519Pkcs8Der(rawPrivKey: Buffer): Buffer {
  const hash = createHash("sha256").update(rawPrivKey).digest();
  const oid = Buffer.from([0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70]);
  const privKeyWrapped = Buffer.concat([Buffer.from([0x04, 0x20]), hash]);
  const privKeyOuter = Buffer.concat([Buffer.from([0x04, privKeyWrapped.length]), privKeyWrapped]);
  const version = Buffer.from([0x02, 0x01, 0x00]);
  const inner = Buffer.concat([version, oid, privKeyOuter]);
  return Buffer.concat([Buffer.from([0x30, inner.length]), inner]);
}
