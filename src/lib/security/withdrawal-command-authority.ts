import { createHash } from "crypto";
import { D } from "@/lib/trading/decimal";

export const WITHDRAWAL_ADMISSION_POLICY_VERSION = "withdrawal-admission-v1";
export const WITHDRAWAL_AUTHORIZATION_TTL_SECONDS = 5 * 60;

const ASSET_DECIMALS: Record<string, number> = {
  BTC: 8,
  ETH: 18,
  USDT: 18,
  USDC: 18,
  BNB: 18,
  XRP: 6,
  SOL: 9,
  ADA: 6,
  DOGE: 8,
  TRX: 6,
  LTC: 8,
  DOT: 10,
  LINK: 18,
  AVAX: 18,
  MATIC: 18,
};

const NETWORK_ASSETS: Record<string, ReadonlySet<string>> = {
  bitcoin: new Set(["BTC"]),
  ethereum: new Set(["ETH", "USDT", "USDC", "LINK"]),
  tron: new Set(["TRX", "USDT", "USDC"]),
  bsc: new Set(["BNB", "USDT", "USDC", "LINK"]),
  solana: new Set(["SOL", "USDT", "USDC"]),
  ripple: new Set(["XRP"]),
  cardano: new Set(["ADA"]),
  polygon: new Set(["MATIC", "USDT", "USDC", "LINK"]),
  avalanche: new Set(["AVAX", "USDT", "USDC"]),
  litecoin: new Set(["LTC"]),
};

export type CanonicalWithdrawalCommand = {
  userId: string;
  asset: string;
  amount: string;
  destinationAddress: string;
  destinationTag: string | null;
  network: string;
  idempotencyKey: string;
};

function cleanAscii(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /[^\x20-\x7E]/.test(trimmed)) return null;
  return trimmed;
}

export function canonicalizeWithdrawalCommand(input: {
  userId: string;
  asset: string;
  amount: string;
  destinationAddress: string;
  destinationTag?: string | null;
  network: string;
  idempotencyKey: string;
}):
  | { ok: true; command: CanonicalWithdrawalCommand; requestHash: string }
  | { ok: false; reason: string } {
  const userId = input.userId.trim();
  const asset = input.asset.toUpperCase().trim();
  const network = input.network.toLowerCase().trim();
  const destinationAddress = cleanAscii(input.destinationAddress);
  const rawTag = input.destinationTag?.trim() || null;
  const destinationTag = rawTag ? cleanAscii(rawTag) : null;
  const idempotencyKey = cleanAscii(input.idempotencyKey);

  if (!userId) return { ok: false, reason: "authentication_required" };
  if (!(asset in ASSET_DECIMALS)) return { ok: false, reason: "unsupported_asset" };
  if (!NETWORK_ASSETS[network]?.has(asset)) {
    return { ok: false, reason: "asset_network_mismatch" };
  }
  if (!destinationAddress || destinationAddress.length > 200) {
    return { ok: false, reason: "invalid_destination_address" };
  }
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    return { ok: false, reason: "invalid_idempotency_key" };
  }
  if (!/^\d+(\.\d+)?$/.test(input.amount.trim())) {
    return { ok: false, reason: "invalid_amount" };
  }

  let amount: string;
  try {
    const parsed = D(input.amount.trim());
    if (!parsed.isFinite() || parsed.lte(0)) {
      return { ok: false, reason: "invalid_amount" };
    }
    if (parsed.decimalPlaces() > ASSET_DECIMALS[asset]) {
      return { ok: false, reason: "amount_precision_exceeded" };
    }
    amount = parsed.toFixed();
  } catch {
    return { ok: false, reason: "invalid_amount" };
  }

  const destinationReason = validateWithdrawalDestination({
    asset,
    network,
    address: destinationAddress,
    destinationTag,
  });
  if (destinationReason) return { ok: false, reason: destinationReason };

  const command: CanonicalWithdrawalCommand = {
    userId,
    asset,
    amount,
    destinationAddress,
    destinationTag,
    network,
    idempotencyKey,
  };
  return { ok: true, command, requestHash: withdrawalRequestHash(command) };
}

export function withdrawalRequestHash(command: CanonicalWithdrawalCommand): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        command.userId,
        command.asset,
        command.amount,
        command.network,
        command.destinationAddress,
        command.destinationTag ?? "",
        command.idempotencyKey,
      ]),
    )
    .digest("hex");
}

export function validateWithdrawalDestination(input: {
  asset: string;
  network: string;
  address: string;
  destinationTag: string | null;
}): string | null {
  const { network, address, destinationTag } = input;
  if (/^(0x0{40}|0+)$/.test(address.toLowerCase())) {
    return "invalid_destination_address";
  }

  const evm = /^0x[0-9a-fA-F]{40}$/;
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  let valid = false;
  switch (network) {
    case "bitcoin":
      valid = /^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address);
      break;
    case "ethereum":
    case "bsc":
    case "polygon":
    case "avalanche":
      valid = evm.test(address);
      break;
    case "tron":
      valid = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
      break;
    case "solana":
      valid = address.length >= 32 && address.length <= 44 && base58.test(address);
      break;
    case "ripple":
      valid = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
      if (!destinationTag || !/^\d{1,10}$/.test(destinationTag)) {
        return "destination_tag_required";
      }
      break;
    case "cardano":
      valid = /^addr1[0-9a-z]{20,}$/.test(address);
      break;
    case "litecoin":
      valid = /^(ltc1[ac-hj-np-z02-9]{11,71}|[LM3][a-km-zA-HJ-NP-Z1-9]{26,33})$/.test(address);
      break;
  }

  if (!valid) return "destination_network_mismatch";
  if (network !== "ripple" && destinationTag) return "unexpected_destination_tag";
  return null;
}
