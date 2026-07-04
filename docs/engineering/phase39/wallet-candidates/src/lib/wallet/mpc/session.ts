// MPC Session State Machine — Phase 39
// Orchestrates MPC signing sessions: create → collect partials → combine.
// The actual cryptography is delegated to the MpcProvider (external SDK).

import type { ChainId } from "../types";
import type { MpcParticipantId, MpcProvider, MpcScheme, MpcSigningSession, PartialSignature } from "./types";

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type SessionResult =
  | { ok: true; signature: Buffer; sessionId: string }
  | { ok: false; error: string; sessionId: string };

export class MpcSessionOrchestrator {
  constructor(private readonly provider: MpcProvider) {}

  /**
   * Orchestrate a full MPC signing round.
   *
   * 1. Create session
   * 2. Broadcast session ID to participants (out-of-band — caller responsibility)
   * 3. Poll until threshold met or timeout
   * 4. Combine signatures
   */
  async orchestrateSign(
    chainId: ChainId,
    scheme: MpcScheme,
    signingHash: Buffer,
    participants: MpcParticipantId[],
    pollIntervalMs = 500,
  ): Promise<SessionResult> {
    const sessionId = await this.provider.createSession(chainId, scheme, signingHash, participants);

    const deadline = Date.now() + SESSION_TTL_MS;
    while (Date.now() < deadline) {
      const session = await this.provider.getSession(sessionId);
      if (!session) {
        return { ok: false, error: "Session not found", sessionId };
      }

      if (session.state === "completed" && session.finalSignature) {
        return { ok: true, signature: session.finalSignature, sessionId };
      }

      if (session.state === "failed") {
        return { ok: false, error: session.failureReason ?? "MPC signing failed", sessionId };
      }

      if (session.state === "expired") {
        return { ok: false, error: "MPC session expired before threshold", sessionId };
      }

      if (session.state === "combining") {
        try {
          const sig = await this.provider.combineSignatures(sessionId);
          return { ok: true, signature: sig, sessionId };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { ok: false, error: `Combine failed: ${msg}`, sessionId };
        }
      }

      await delay(pollIntervalMs);
    }

    await this.provider.cancelSession(sessionId).catch(() => void 0);
    return { ok: false, error: "MPC signing orchestration timed out", sessionId };
  }

  async submitPartial(partial: PartialSignature): Promise<void> {
    await this.provider.submitPartialSignature(partial);
  }

  async getSession(sessionId: string): Promise<MpcSigningSession | null> {
    return this.provider.getSession(sessionId);
  }

  async cancel(sessionId: string): Promise<void> {
    await this.provider.cancelSession(sessionId);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
