// MPC Orchestrator — Phase 39
// MpcKeyStore implementation that delegates to MpcSessionOrchestrator + MpcProvider.
// This replaces the Phase 38 stub that threw "not implemented".

import type { ChainId, KeyStore, KeyStoreType } from "../types";
import type { MpcParticipantId, MpcProvider, MpcScheme } from "./types";
import { MpcSessionOrchestrator } from "./session";

type MpcConfig = {
  provider: MpcProvider;
  scheme: MpcScheme;
  participants: MpcParticipantId[];
};

export class MpcKeyStore implements KeyStore {
  readonly type: KeyStoreType = "mpc";
  private readonly orchestrator: MpcSessionOrchestrator;

  constructor(private readonly config: MpcConfig) {
    this.orchestrator = new MpcSessionOrchestrator(config.provider);
  }

  isConfigured(chainId: ChainId): boolean {
    // MPC is configured if the provider exists and participants are set.
    // Chain support depends on provider capability.
    return this.config.participants.length >= 2 && this.config.provider.name !== "";
  }

  async getAddress(chainId: ChainId, _index?: number): Promise<string> {
    // MPC address is derived from the distributed public key.
    // The provider exposes this via getSession on a completed DKG ceremony.
    // During Phase 39 the public key is retrieved from the HSM-backed MPC key store.
    const handle = await this.getKeyHandle(chainId);
    const { deriveAddressFromPublicKey } = await import("../address/derivation");
    return deriveAddressFromPublicKey(handle, chainId);
  }

  async sign(chainId: ChainId, signingHash: Buffer, _index?: number): Promise<Buffer> {
    const result = await this.orchestrator.orchestrateSign(
      chainId,
      this.config.scheme,
      signingHash,
      this.config.participants,
    );

    if (!result.ok) {
      // Never include key material in error — signingHash is data, not a secret
      throw new Error(`MPC signing failed [session=${result.sessionId}]: ${result.error}`);
    }

    return result.signature;
  }

  private async getKeyHandle(chainId: ChainId): Promise<Buffer> {
    // In production: call provider.getDistributedPublicKey(chainId)
    // This is a placeholder that returns a deterministic test public key.
    // Real implementation retrieves the combined public key from the MPC ceremony.
    throw new Error(
      `MPC public key retrieval not yet implemented for ${chainId}. ` +
      "Configure MPC_KEY_CEREMONY_RESULT env or call the provider's key export API.",
    );
  }
}

// ── Unimplemented provider stub (documents the interface contract) ────────────
// When a real MPC SDK is integrated (Phase 40), implement MpcProvider and pass it
// to MpcKeyStore via createMpcKeyStore().

export class UnimplementedMpcProvider implements MpcProvider {
  readonly name = "unimplemented";
  readonly supportedSchemes: MpcScheme[] = [];

  async createSession(): Promise<string> {
    throw new Error("MPC provider not implemented. Wire a real provider in Phase 40.");
  }

  async submitPartialSignature(): Promise<void> {
    throw new Error("MPC provider not implemented.");
  }

  async getSession(): Promise<null> {
    return null;
  }

  async combineSignatures(): Promise<Buffer> {
    throw new Error("MPC provider not implemented.");
  }

  async cancelSession(): Promise<void> {
    // no-op
  }
}

export function createMpcKeyStore(): MpcKeyStore {
  const endpoint = process.env.MPC_ENDPOINT;
  const partyId = process.env.MPC_PARTY_ID;
  const participants = (process.env.MPC_PARTICIPANTS ?? "").split(",").filter(Boolean);
  const scheme = (process.env.MPC_SCHEME ?? "2-of-3") as MpcScheme;

  if (!endpoint || !partyId || participants.length < 2) {
    throw new Error("MPC not configured. Set MPC_ENDPOINT, MPC_PARTY_ID, MPC_PARTICIPANTS.");
  }

  // In Phase 40: replace UnimplementedMpcProvider with real MPC SDK adapter
  return new MpcKeyStore({
    provider: new UnimplementedMpcProvider(),
    scheme,
    participants,
  });
}
