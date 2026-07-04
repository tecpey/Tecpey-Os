// MPC Types — Phase 39
// Multi-Party Computation abstraction for threshold signing.
//
// Design philosophy:
//   Real threshold ECDSA (e.g. GG18, CGGMP21, Lindell17) requires:
//     - Key generation ceremony (DKG) across N parties
//     - Pre-processing round (offline phase)
//     - Online signing round (partial sig shares)
//     - Combination of partial sigs into full sig
//   This file models the orchestration layer. No crypto is implemented here.
//   A real MPC SDK (Fireblocks MPC SDK, Partisia, Entropy) plugs in via MpcProvider.

import type { ChainId } from "../types";

export type MpcSessionId = string;

export type MpcParticipantId = string;

export type MpcScheme = "2-of-3" | "3-of-5" | "2-of-2";

export type MpcSessionState =
  | "created"
  | "awaiting_participants"
  | "preprocessing"
  | "signing"
  | "combining"
  | "completed"
  | "failed"
  | "expired";

export type PartialSignature = {
  sessionId: MpcSessionId;
  participantId: MpcParticipantId;
  round: number;
  payload: Buffer;      // partial sig share — opaque to orchestration layer
  createdAt: Date;
};

export type MpcSigningSession = {
  id: MpcSessionId;
  chainId: ChainId;
  scheme: MpcScheme;
  state: MpcSessionState;
  signingHash: Buffer;
  participants: MpcParticipantId[];
  partialSignatures: PartialSignature[];
  requiredThreshold: number;
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  finalSignature?: Buffer;  // compact 64 bytes when completed
  failureReason?: string;
};

// ── MPC Provider Interface ────────────────────────────────────────────────────
// Real MPC SDK implements this interface. Phase 39 models architecture only.

export interface MpcProvider {
  readonly name: string;
  readonly supportedSchemes: MpcScheme[];

  /** Initialize a new signing session. Returns session ID. */
  createSession(
    chainId: ChainId,
    scheme: MpcScheme,
    signingHash: Buffer,
    participants: MpcParticipantId[],
  ): Promise<MpcSessionId>;

  /** Submit a partial signature from one participant */
  submitPartialSignature(partial: PartialSignature): Promise<void>;

  /** Check current session state */
  getSession(sessionId: MpcSessionId): Promise<MpcSigningSession | null>;

  /** Combine partial signatures into final signature (threshold met) */
  combineSignatures(sessionId: MpcSessionId): Promise<Buffer>;

  /** Cancel / expire a session */
  cancelSession(sessionId: MpcSessionId): Promise<void>;
}

// ── Key Share Reference ───────────────────────────────────────────────────────
// Key shares are held by MPC parties, never by the orchestration layer.

export type MpcKeyRef = {
  keyId: string;          // MPC key identifier (no share material)
  chainId: ChainId;
  scheme: MpcScheme;
  partyCount: number;
  threshold: number;
  createdAt: Date;
};
