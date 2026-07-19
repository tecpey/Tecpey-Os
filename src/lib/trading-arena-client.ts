import type { ArenaAccount, ArenaAttempt } from "@/lib/trading-arena-account";
import {
  type ArenaExecutionActionV2,
  type ArenaExecutionStateV2,
  type ArenaPriceSnapshot,
} from "@/lib/trading-arena-execution-v2";
import { validateArenaExecutionStateV2 } from "@/lib/trading-arena-execution-state-validation";

export type ArenaExecutionSnapshot = {
  account: ArenaAccount;
  attempts: ArenaAttempt[];
  activeAttempt: ArenaAttempt;
  state: ArenaExecutionStateV2;
  revision: number;
  market: ArenaPriceSnapshot | null;
  projectedEquity: string;
  marketStatus: "available" | "unavailable";
  eventType: string | null;
  idempotentReplay: boolean;
};

export type ArenaExecutionCommand = ArenaExecutionActionV2;

export type ArenaSnapshotDecision = {
  apply: boolean;
  nextSequence: number;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function finiteInteger(value: unknown, min = 0): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min ? parsed : null;
}

function text(value: unknown, max = 240): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : null;
}

function amount(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 100) return null;
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) ? value : null;
}

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function account(value: unknown): ArenaAccount | null {
  const row = record(value);
  if (!row) return null;
  const status = row.status;
  if (status !== "active" && status !== "locked" && status !== "completed") return null;
  const cycleId = text(row.cycleId, 120);
  const initialBalance = amount(row.initialBalance);
  const availableBalance = amount(row.availableBalance);
  const attemptsTotal = finiteInteger(row.attemptsTotal, 1);
  const attemptsUsed = finiteInteger(row.attemptsUsed);
  const attemptsRemaining = finiteInteger(row.attemptsRemaining);
  const currentAttempt = finiteInteger(row.currentAttempt, 1);
  const revision = finiteInteger(row.revision);
  const cycleStartedAt = timestamp(row.cycleStartedAt);
  const cycleEndsAt = timestamp(row.cycleEndsAt);
  if (
    !cycleId || !initialBalance || !availableBalance || attemptsTotal === null ||
    attemptsUsed === null || attemptsRemaining === null || currentAttempt === null ||
    revision === null || !cycleStartedAt || !cycleEndsAt
  ) return null;
  if (attemptsUsed > attemptsTotal || attemptsRemaining !== attemptsTotal - attemptsUsed) return null;
  if (numberValue(initialBalance) <= 0 || numberValue(availableBalance) < 0) return null;
  return {
    cycleId,
    status,
    initialBalance,
    availableBalance,
    attemptsTotal,
    attemptsUsed,
    attemptsRemaining,
    currentAttempt,
    revision,
    cycleStartedAt,
    cycleEndsAt,
  };
}

function attempt(value: unknown): ArenaAttempt | null {
  const row = record(value);
  if (!row) return null;
  const status = row.status;
  if (status !== "active" && status !== "available" && status !== "failed" && status !== "passed") return null;
  const id = text(row.id, 120);
  const cycleId = text(row.cycleId, 120);
  const attemptNumber = finiteInteger(row.attemptNumber, 1);
  const startingBalance = amount(row.startingBalance);
  const cashBalance = amount(row.cashBalance);
  const equity = amount(row.equity);
  const startedAt = row.startedAt === null ? null : timestamp(row.startedAt);
  const endedAt = row.endedAt === null ? null : timestamp(row.endedAt);
  if (!id || !cycleId || attemptNumber === null || !startingBalance || !cashBalance || !equity) return null;
  if (numberValue(startingBalance) <= 0 || numberValue(cashBalance) < 0 || numberValue(equity) < 0) return null;
  if (row.startedAt !== null && !startedAt) return null;
  if (row.endedAt !== null && !endedAt) return null;
  return { id, cycleId, attemptNumber, status, startingBalance, cashBalance, equity, startedAt, endedAt };
}

function market(value: unknown): ArenaPriceSnapshot | null {
  if (value === null || value === undefined) return null;
  const row = record(value);
  const prices = record(row?.prices);
  const BTC = amount(prices?.BTC);
  const ETH = amount(prices?.ETH);
  const source = text(row?.source, 120);
  const observedAt = timestamp(row?.observedAt);
  if (!BTC || !ETH || !source || !observedAt) return null;
  if (Number(BTC) <= 0 || Number(ETH) <= 0) return null;
  return { prices: { BTC, ETH }, source, observedAt };
}

function snapshotSource(value: unknown): UnknownRecord | null {
  const root = record(value);
  if (!root) return null;
  return record(root.details) ?? root;
}

export function parseArenaExecutionSnapshot(value: unknown): ArenaExecutionSnapshot | null {
  const source = snapshotSource(value);
  if (!source) return null;
  const parsedAccount = account(source.account);
  const parsedAttempts = Array.isArray(source.attempts)
    ? source.attempts.map(attempt).filter((item): item is ArenaAttempt => item !== null)
    : [];
  const activeAttempt = attempt(source.activeAttempt);
  const revision = finiteInteger(source.revision);
  if (!parsedAccount || !activeAttempt || revision === null) return null;
  if (parsedAttempts.length === 0 || parsedAttempts.some((item) => item.cycleId !== parsedAccount.cycleId)) return null;
  if (!parsedAttempts.some((item) => item.id === activeAttempt.id && item.status === "active")) return null;

  let state: ArenaExecutionStateV2;
  try {
    state = validateArenaExecutionStateV2(source.state);
  } catch {
    return null;
  }
  const responseMarket = market(source.market);
  const parsedMarket = responseMarket ?? state.lastMarket;
  const marketStatus = source.marketStatus === "unavailable" || !parsedMarket
    ? "unavailable"
    : "available";
  const projectedEquity = amount(source.projectedEquity) ?? state.equity;
  if (numberValue(projectedEquity) < 0) return null;
  const eventType = typeof source.eventType === "string" ? source.eventType.slice(0, 160) : null;
  return {
    account: parsedAccount,
    attempts: parsedAttempts,
    activeAttempt,
    state,
    revision,
    market: parsedMarket,
    projectedEquity,
    marketStatus,
    eventType,
    idempotentReplay: source.idempotentReplay === true,
  };
}

function marketTime(snapshot: ArenaExecutionSnapshot): number {
  return snapshot.market ? Date.parse(snapshot.market.observedAt) : 0;
}

export function shouldApplyArenaSnapshot(input: {
  current: ArenaExecutionSnapshot | null;
  incoming: ArenaExecutionSnapshot;
  responseSequence: number;
  lastAppliedSequence: number;
}): ArenaSnapshotDecision {
  if (!input.current) {
    return { apply: true, nextSequence: Math.max(input.lastAppliedSequence, input.responseSequence) };
  }

  const sameAuthority =
    input.current.account.cycleId === input.incoming.account.cycleId &&
    input.current.activeAttempt.id === input.incoming.activeAttempt.id;

  if (!sameAuthority) {
    if (input.responseSequence < input.lastAppliedSequence) {
      return { apply: false, nextSequence: input.lastAppliedSequence };
    }
    return { apply: true, nextSequence: input.responseSequence };
  }

  if (input.incoming.revision > input.current.revision) {
    return { apply: true, nextSequence: Math.max(input.lastAppliedSequence, input.responseSequence) };
  }
  if (input.incoming.revision < input.current.revision) {
    return { apply: false, nextSequence: input.lastAppliedSequence };
  }
  if (input.responseSequence < input.lastAppliedSequence) {
    return { apply: false, nextSequence: input.lastAppliedSequence };
  }
  if (marketTime(input.incoming) < marketTime(input.current)) {
    return { apply: false, nextSequence: input.lastAppliedSequence };
  }
  return { apply: true, nextSequence: input.responseSequence };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
    .join(",")}}`;
}

export function arenaCommandFingerprint(action: ArenaExecutionCommand): string {
  return canonical(action);
}

export function createArenaIdempotencyKey(
  action: ArenaExecutionCommand["type"],
  entropy?: string,
): string {
  const generated = entropy ?? globalThis.crypto?.randomUUID?.();
  if (!generated) throw new Error("arena_idempotency_entropy_unavailable");
  const safeEntropy = generated.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 80);
  const key = `arena-ui:${action}:${safeEntropy}`;
  if (safeEntropy.length < 8 || key.length > 120) throw new Error("arena_idempotency_entropy_invalid");
  return key;
}

export function arenaUiError(error: unknown, status?: number): string {
  const code = typeof error === "string" ? error : "arena_execution_unavailable";
  const messages: Record<string, string> = {
    academy_profile_required: "برای ورود به آرنا ابتدا پروفایل آکادمی را کامل کنید.",
    revision_conflict: "وضعیت آرنا روی دستگاه دیگری تغییر کرده است. نسخه تازه بازیابی شد؛ تصمیم را دوباره بررسی کنید.",
    idempotency_key_reused: "شناسه درخواست قبلاً برای فرمان دیگری استفاده شده است. دوباره تلاش کنید.",
    idempotency_key_required: "شناسه امن درخواست ساخته نشد. صفحه را تازه‌سازی کنید.",
    arena_price_feed_unavailable: "قیمت معتبر سرور در دسترس نیست؛ برای حفاظت از حساب، معامله متوقف شد.",
    arena_no_active_attempt: "فرصت فعال آرنا در دسترس نیست.",
    arena_trade_below_minimum: "حداقل مبلغ معامله ۱۰ USDT است.",
    arena_insufficient_cash: "موجودی نقد برای این معامله کافی نیست.",
    arena_risk_limit_exceeded: "حجم معامله از سقف ریسک مجاز آرنا بیشتر است.",
    arena_protective_price_invalid: "حد ضرر یا حد سود با قیمت ورود سازگار نیست.",
    arena_open_position_limit: "حداکثر تعداد موقعیت‌های باز تکمیل شده است.",
    arena_pending_order_limit: "حداکثر تعداد سفارش‌های در انتظار تکمیل شده است.",
    arena_position_not_found: "این موقعیت دیگر در نسخه معتبر سرور وجود ندارد.",
    arena_order_not_found: "این سفارش دیگر در نسخه معتبر سرور وجود ندارد.",
    invalid_arena_action: "اطلاعات فرمان معامله معتبر نیست.",
    invalid_revision: "نسخه وضعیت آرنا معتبر نیست؛ صفحه را تازه‌سازی کنید.",
    rate_limited: "درخواست‌ها بیش از حد سریع بودند؛ چند لحظه بعد دوباره تلاش کنید.",
    forbidden: "نشست معتبر نیست؛ صفحه را تازه‌سازی کنید.",
    arena_execution_unavailable: "موتور امن آرنا موقتاً در دسترس نیست.",
  };
  if (messages[code]) return messages[code];
  if (status === 401) return messages.academy_profile_required;
  return "ارتباط امن با موتور آرنا انجام نشد. اطلاعات فرم حفظ شده است؛ دوباره تلاش کنید.";
}
