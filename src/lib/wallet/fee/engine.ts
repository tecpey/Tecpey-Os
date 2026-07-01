// Fee Engine — Phase 38
// Dynamic fee estimation per chain. economy/normal/fast/priority speeds.
// Caches estimates with TTL to avoid hammering RPC on every request.

import { getRpcClient } from "../rpc/client";
import type { ChainId, FeeConfig, FeeEstimate, FeeSpeed } from "../types";

const CACHE_TTL: Record<FeeSpeed, number> = {
  economy: 60_000,
  normal: 30_000,
  fast: 15_000,
  priority: 10_000,
};

const cache = new Map<string, FeeEstimate>();

function cacheKey(chainId: ChainId, speed: FeeSpeed): string {
  return `${chainId}:${speed}`;
}

function getCached(chainId: ChainId, speed: FeeSpeed): FeeEstimate | null {
  const key = cacheKey(chainId, speed);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.estimatedAt.getTime() > CACHE_TTL[speed]) {
    cache.delete(key);
    return null;
  }
  return entry;
}

// ── Bitcoin ───────────────────────────────────────────────────────────────────

const BTC_SPEED_MULTIPLIERS: Record<FeeSpeed, number> = {
  economy: 0.5, normal: 1.0, fast: 1.5, priority: 2.5,
};

async function estimateBitcoinFee(speed: FeeSpeed, _config?: FeeConfig): Promise<FeeEstimate> {
  const rpc = getRpcClient("bitcoin");
  let satsPerVByte = 10;

  try {
    const blockTargets: Record<FeeSpeed, number> = {
      economy: 144, normal: 6, fast: 2, priority: 1,
    };
    type SmartFeeResult = { feerate?: number; errors?: string[] };
    const result = await rpc.call<SmartFeeResult>("estimatesmartfee", [blockTargets[speed]]);
    if (result.feerate) {
      satsPerVByte = Math.ceil(result.feerate * 100_000 / 1024) * BTC_SPEED_MULTIPLIERS[speed];
    }
  } catch {
    satsPerVByte = 10 * BTC_SPEED_MULTIPLIERS[speed];
  }

  const typicalVBytes = 141;
  const networkFeeSats = Math.ceil(satsPerVByte * typicalVBytes);
  const networkFeeBtc = (networkFeeSats / 1e8).toFixed(8);

  return {
    chainId: "bitcoin",
    speed,
    networkFee: networkFeeBtc,
    estimatedAt: new Date(),
    validForSeconds: CACHE_TTL[speed] / 1000,
    details: {
      satsPerVByte: satsPerVByte.toString(),
      typicalVBytes: typicalVBytes.toString(),
      totalSats: networkFeeSats.toString(),
    },
  };
}

// ── Ethereum EIP-1559 ─────────────────────────────────────────────────────────

const ETH_PRIORITY_MULTIPLIERS: Record<FeeSpeed, number> = {
  economy: 0.5, normal: 1.0, fast: 1.5, priority: 2.5,
};

async function estimateEthereumFee(chainId: ChainId, speed: FeeSpeed): Promise<FeeEstimate> {
  const rpc = getRpcClient(chainId);
  let baseFeeGwei = BigInt(10);
  let maxPriorityFeeGwei = BigInt(1);

  try {
    type FeeHistoryResult = { baseFeePerGas: string[]; reward?: string[][] };
    const history = await rpc.call<FeeHistoryResult>("eth_feeHistory", [4, "latest", [25, 50, 75]]);
    if (history.baseFeePerGas && history.baseFeePerGas.length > 0) {
      const latestHex = history.baseFeePerGas[history.baseFeePerGas.length - 1];
      baseFeeGwei = BigInt(latestHex) / BigInt(1_000_000_000);
    }
    if (history.reward && history.reward.length > 0) {
      const tips = history.reward.map((r) => BigInt(r[1] ?? "0x0"));
      const avgTip = tips.reduce((a, b) => a + b, BigInt(0)) / BigInt(tips.length);
      maxPriorityFeeGwei = avgTip / BigInt(1_000_000_000);
    }
  } catch {
    baseFeeGwei = BigInt(15);
    maxPriorityFeeGwei = BigInt(2);
  }

  const multiplier = ETH_PRIORITY_MULTIPLIERS[speed];
  const adjustedPriorityGwei = BigInt(Math.ceil(Number(maxPriorityFeeGwei) * multiplier));
  const maxFeeGwei = baseFeeGwei * BigInt(2) + adjustedPriorityGwei;
  const gasLimit = BigInt(21_000);
  const networkFeeWei = maxFeeGwei * gasLimit * BigInt(1_000_000_000);
  const networkFeeEth = (Number(networkFeeWei) / 1e18).toFixed(8);

  return {
    chainId,
    speed,
    networkFee: networkFeeEth,
    estimatedAt: new Date(),
    validForSeconds: CACHE_TTL[speed] / 1000,
    details: {
      baseFeeGwei: baseFeeGwei.toString(),
      maxPriorityFeeGwei: adjustedPriorityGwei.toString(),
      maxFeePerGasGwei: maxFeeGwei.toString(),
      gasLimit: gasLimit.toString(),
    },
  };
}

// ── Solana ────────────────────────────────────────────────────────────────────

async function estimateSolanaFee(speed: FeeSpeed): Promise<FeeEstimate> {
  const rpc = getRpcClient("solana");
  let microLamportsPerCU = 1_000;

  try {
    const result = await rpc.call<unknown>("getRecentPrioritizationFees", []);
    if (Array.isArray(result) && result.length > 0) {
      const fees = (result as Array<{ prioritizationFee: number }>)
        .map((r) => r.prioritizationFee)
        .sort((a, b) => a - b);
      const idx = Math.floor(fees.length * (speed === "economy" ? 0.25 : speed === "normal" ? 0.5 : 0.75));
      microLamportsPerCU = fees[idx] ?? 1_000;
    }
  } catch {
    microLamportsPerCU = 1_000;
  }

  const computeUnits = 200_000;
  const baseFeelamports = 5_000;
  const priorityFeeLamports = Math.ceil(microLamportsPerCU * computeUnits / 1_000_000);
  const totalLamports = baseFeelamports + priorityFeeLamports;
  const networkFeeSol = (totalLamports / 1e9).toFixed(9);

  return {
    chainId: "solana",
    speed,
    networkFee: networkFeeSol,
    estimatedAt: new Date(),
    validForSeconds: CACHE_TTL[speed] / 1000,
    details: {
      microLamportsPerCU: microLamportsPerCU.toString(),
      computeUnits: computeUnits.toString(),
      baseFeelamports: baseFeelamports.toString(),
      priorityFeeLamports: priorityFeeLamports.toString(),
    },
  };
}

// ── Tron ──────────────────────────────────────────────────────────────────────

async function estimateTronFee(_speed: FeeSpeed): Promise<FeeEstimate> {
  return {
    chainId: "tron",
    speed: _speed,
    networkFee: "1.000000",
    estimatedAt: new Date(),
    validForSeconds: 60,
    details: {
      bandwidthPoints: "267",
      energyRequired: "0",
      note: "Tron fees depend on staked resources. Free if sufficient bandwidth.",
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function estimateFee(chainId: ChainId, speed: FeeSpeed): Promise<FeeEstimate> {
  const cached = getCached(chainId, speed);
  if (cached) return cached;

  let estimate: FeeEstimate;

  switch (chainId) {
    case "bitcoin":
      estimate = await estimateBitcoinFee(speed);
      break;
    case "ethereum":
    case "bsc":
    case "polygon":
      estimate = await estimateEthereumFee(chainId, speed);
      break;
    case "solana":
      estimate = await estimateSolanaFee(speed);
      break;
    case "tron":
      estimate = await estimateTronFee(speed);
      break;
    default:
      throw new Error(`Fee estimation not supported for chain: ${chainId}`);
  }

  cache.set(cacheKey(chainId, speed), estimate);
  return estimate;
}

export function getEthereumGasForTransfer(tokenContract?: string): bigint {
  return tokenContract ? BigInt(65_000) : BigInt(21_000);
}
