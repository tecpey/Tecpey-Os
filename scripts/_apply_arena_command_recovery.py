from pathlib import Path


def replace_once(path: str, before: str, after: str) -> None:
    file = Path(path)
    text = file.read_text()
    assert text.count(before) == 1, f"expected one source fragment in {path}: {before[:100]!r}"
    assert after not in text, f"replacement already present in {path}: {after[:100]!r}"
    file.write_text(text.replace(before, after, 1))


replace_once(
    "src/lib/trading-arena-client.ts",
    "export type ArenaExecutionCommand = ArenaExecutionActionV2;\n\nexport type ArenaSnapshotDecision = {",
    '''export type ArenaExecutionCommand = ArenaExecutionActionV2;

export type ArenaPendingCommandIdentity = {
  attemptId: string;
  expectedRevision: number;
  fingerprint: string;
  idempotencyKey: string;
  action: ArenaExecutionCommand;
};

export type ArenaCommandIdentityDecision =
  | { kind: "ready"; identity: ArenaPendingCommandIdentity; reused: boolean }
  | { kind: "blocked"; identity: ArenaPendingCommandIdentity };

export type ArenaSnapshotDecision = {''',
)

replace_once(
    "src/lib/trading-arena-client.ts",
    "export function arenaUiError(error: unknown, status?: number): string {\n",
    '''export function resolveArenaCommandIdentity(input: {
  pending: ArenaPendingCommandIdentity | null;
  attemptId: string;
  revision: number;
  action: ArenaExecutionCommand;
  entropy?: string;
}): ArenaCommandIdentityDecision {
  const fingerprint = arenaCommandFingerprint(input.action);
  if (input.pending && input.pending.attemptId === input.attemptId) {
    if (input.pending.fingerprint !== fingerprint) {
      return { kind: "blocked", identity: input.pending };
    }
    return { kind: "ready", identity: input.pending, reused: true };
  }
  return {
    kind: "ready",
    reused: false,
    identity: {
      attemptId: input.attemptId,
      expectedRevision: input.revision,
      fingerprint,
      idempotencyKey: createArenaIdempotencyKey(input.action.type, input.entropy),
      action: input.action,
    },
  };
}

export function arenaUiError(error: unknown, status?: number): string {
''',
)

replace_once(
    "src/components/academy/trading-arena/TradingArenaExecutionClient.tsx",
    '''  arenaCommandFingerprint,
  arenaUiError,
  createArenaIdempotencyKey,
  parseArenaExecutionSnapshot,
  shouldApplyArenaSnapshot,
  type ArenaExecutionCommand,
  type ArenaExecutionSnapshot,
''',
    '''  arenaUiError,
  parseArenaExecutionSnapshot,
  resolveArenaCommandIdentity,
  shouldApplyArenaSnapshot,
  type ArenaExecutionCommand,
  type ArenaExecutionSnapshot,
  type ArenaPendingCommandIdentity,
''',
)

replace_once(
    "src/components/academy/trading-arena/TradingArenaExecutionClient.tsx",
    '''type PendingCommandIdentity = {
  attemptId: string;
  expectedRevision: number;
  fingerprint: string;
  idempotencyKey: string;
};

''',
    "",
)

replace_once(
    "src/components/academy/trading-arena/TradingArenaExecutionClient.tsx",
    "const pendingCommandRef = useRef<PendingCommandIdentity | null>(null);",
    "const pendingCommandRef = useRef<ArenaPendingCommandIdentity | null>(null);",
)

replace_once(
    "src/components/academy/trading-arena/TradingArenaExecutionClient.tsx",
    '''    if (commandLockRef.current) {
      if (!options?.quiet) setError("آرنا در حال همگام‌سازی یک فرمان معتبر است؛ چند لحظه بعد دوباره ارسال کنید.");
      return false;
    }
    commandLockRef.current = true;
    const sequence = ++sequenceRef.current;
''',
    '''    if (commandLockRef.current) {
      if (!options?.quiet) setError("آرنا در حال همگام‌سازی یک فرمان معتبر است؛ چند لحظه بعد دوباره ارسال کنید.");
      return false;
    }
    const identityDecision = resolveArenaCommandIdentity({
      pending: pendingCommandRef.current,
      attemptId: current.activeAttempt.id,
      revision: current.revision,
      action,
    });
    if (identityDecision.kind === "blocked") {
      if (!options?.quiet) {
        setError("نتیجه فرمان قبلی هنوز قطعی نشده است. ابتدا همان فرمان با شناسه امن قبلی بازیابی می‌شود.");
      }
      return false;
    }
    const identity = identityDecision.identity;
    pendingCommandRef.current = identity;
    commandLockRef.current = true;
    const sequence = ++sequenceRef.current;
''',
)

replace_once(
    "src/components/academy/trading-arena/TradingArenaExecutionClient.tsx",
    '''      const fingerprint = arenaCommandFingerprint(action);
      const previousIdentity = pendingCommandRef.current;
      const identity = previousIdentity &&
        previousIdentity.attemptId === current.activeAttempt.id &&
        previousIdentity.fingerprint === fingerprint
        ? previousIdentity
        : {
            attemptId: current.activeAttempt.id,
            expectedRevision: current.revision,
            fingerprint,
            idempotencyKey: createArenaIdempotencyKey(action.type),
          };
      pendingCommandRef.current = identity;
''',
    "",
)

replace_once(
    "src/components/academy/trading-arena/TradingArenaExecutionClient.tsx",
    '''      if (document.visibilityState !== "visible" || commandLockRef.current) return;
      if (hasLiveCommands) void sendCommand({ type: "refresh_market" }, { quiet: true });
      else void loadSnapshot({ quiet: true });
''',
    '''      if (document.visibilityState !== "visible" || commandLockRef.current) return;
      const pending = pendingCommandRef.current;
      if (pending && pending.attemptId === snapshot.activeAttempt.id) {
        void sendCommand(pending.action, { quiet: true });
        return;
      }
      if (pending) pendingCommandRef.current = null;
      if (hasLiveCommands) void sendCommand({ type: "refresh_market" }, { quiet: true });
      else void loadSnapshot({ quiet: true });
''',
)

replace_once(
    "src/tests/arena/client-authority.test.ts",
    '''  parseArenaExecutionSnapshot,
  shouldApplyArenaSnapshot,
''',
    '''  parseArenaExecutionSnapshot,
  resolveArenaCommandIdentity,
  shouldApplyArenaSnapshot,
''',
)

replace_once(
    "src/tests/arena/client-authority.test.ts",
    '''  it("creates bounded command-specific idempotency keys", () => {
    assert.equal(
      createArenaIdempotencyKey("market_buy", "12345678-1234-4234-8234-123456789012"),
      "arena-ui:market_buy:12345678-1234-4234-8234-123456789012",
    );
    assert.throws(() => createArenaIdempotencyKey("market_buy", "short"), /arena_idempotency_entropy_invalid/);
  });
});
''',
    '''  it("creates bounded command-specific idempotency keys", () => {
    assert.equal(
      createArenaIdempotencyKey("market_buy", "12345678-1234-4234-8234-123456789012"),
      "arena-ui:market_buy:12345678-1234-4234-8234-123456789012",
    );
    assert.throws(() => createArenaIdempotencyKey("market_buy", "short"), /arena_idempotency_entropy_invalid/);
  });

  it("reuses an unresolved command identity and preserves its original revision", () => {
    const action = { type: "market_buy", asset: "BTC", quoteAmount: "100" } as const;
    const first = resolveArenaCommandIdentity({
      pending: null,
      attemptId: "attempt-a",
      revision: 7,
      action,
      entropy: "12345678-1234-4234-8234-123456789012",
    });
    if (first.kind !== "ready") throw new Error("expected ready identity");
    const replay = resolveArenaCommandIdentity({
      pending: first.identity,
      attemptId: "attempt-a",
      revision: 9,
      action,
      entropy: "87654321-4321-4321-8321-210987654321",
    });
    if (replay.kind !== "ready") throw new Error("expected replay identity");
    assert.equal(replay.reused, true);
    assert.equal(replay.identity.idempotencyKey, first.identity.idempotencyKey);
    assert.equal(replay.identity.expectedRevision, 7);
    assert.deepEqual(replay.identity.action, action);
  });

  it("blocks a different command while an ambiguous command remains unresolved", () => {
    const pending = resolveArenaCommandIdentity({
      pending: null,
      attemptId: "attempt-a",
      revision: 4,
      action: { type: "close_position", positionId: "position-1" },
      entropy: "12345678-1234-4234-8234-123456789012",
    });
    if (pending.kind !== "ready") throw new Error("expected ready identity");
    const blocked = resolveArenaCommandIdentity({
      pending: pending.identity,
      attemptId: "attempt-a",
      revision: 4,
      action: { type: "refresh_market" },
      entropy: "87654321-4321-4321-8321-210987654321",
    });
    assert.equal(blocked.kind, "blocked");
  });

  it("discards an identity from an old attempt instead of replaying it on a new attempt", () => {
    const pending = resolveArenaCommandIdentity({
      pending: null,
      attemptId: "attempt-a",
      revision: 11,
      action: { type: "cancel_order", orderId: "order-1" },
      entropy: "12345678-1234-4234-8234-123456789012",
    });
    if (pending.kind !== "ready") throw new Error("expected ready identity");
    const next = resolveArenaCommandIdentity({
      pending: pending.identity,
      attemptId: "attempt-b",
      revision: 0,
      action: { type: "refresh_market" },
      entropy: "87654321-4321-4321-8321-210987654321",
    });
    if (next.kind !== "ready") throw new Error("expected new-attempt identity");
    assert.equal(next.reused, false);
    assert.equal(next.identity.attemptId, "attempt-b");
    assert.equal(next.identity.expectedRevision, 0);
    assert.deepEqual(next.identity.action, { type: "refresh_market" });
    assert.notEqual(next.identity.idempotencyKey, pending.identity.idempotencyKey);
  });
});
''',
)

replace_once(
    "scripts/check-arena-ui-authority.mjs",
    '''  ["client", "parseArenaExecutionSnapshot", "all API payloads must pass strict runtime validation"],
  ["client", "shouldApplyArenaSnapshot", "stale response protection is required"],
''',
    '''  ["client", "parseArenaExecutionSnapshot", "all API payloads must pass strict runtime validation"],
  ["client", "resolveArenaCommandIdentity", "ambiguous commands must preserve one idempotency identity"],
  ["client", "pending.action", "polling must retry the unresolved command before any refresh command"],
  ["client", "shouldApplyArenaSnapshot", "stale response protection is required"],
''',
)

client = Path("src/components/academy/trading-arena/TradingArenaExecutionClient.tsx").read_text()
assert "arenaCommandFingerprint" not in client
assert "createArenaIdempotencyKey" not in client
assert "pending.action" in client
assert "resolveArenaCommandIdentity" in client
