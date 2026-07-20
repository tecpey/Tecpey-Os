// Signing KeyStore — Phase 38
//
// Provides the signing abstraction layer. Concrete implementations:
//   - HotWalletKeyStore  — env-var private keys, for Phase 38
//   - HsmKeyStore        — interface stub for Phase 39 (HSM integration)
//   - MpcKeyStore        — interface stub for Phase 40 (MPC integration)
//
// SECURITY INVARIANTS (enforced here, not caller):
//   - Private keys NEVER appear in logs, exceptions, or serialized objects
//   - Key bytes are zeroed immediately after signing/derivation
//   - Key material sourced from environment only, never hardcoded

import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign } from "crypto";
import type { ChainId, KeyStore, KeyStoreType } from "../types";
import {
  CustodyConfigurationError,
  CustodyGateError,
  getCustodyRuntimeStatus,
  isEnvironmentKeySignerAllowed,
  isSimulationSignerAllowed,
} from "../custody-policy";

// ── secp256k1 helpers (BTC / ETH / EVM) ──────────────────────────────────────

async function secp256k1Sign(privateKeyHex: string, hash: Buffer): Promise<Buffer> {
  const { signAsync } = await import("@noble/secp256k1");
  const privKeyBytes = Buffer.from(privateKeyHex, "hex");
  try {
    // Returns compact 64-byte signature (r || s) as Uint8Array-like
    const sig = await signAsync(hash, privKeyBytes, { lowS: true });
    // sig is a Uint8Array-like with toHex(); cast to access it
    const sigWithMethods = sig as unknown as { toHex(): string };
    return Buffer.from(sigWithMethods.toHex(), "hex"); // 64 bytes compact
  } finally {
    privKeyBytes.fill(0);
  }
}

async function secp256k1GetPublicKey(privateKeyHex: string, compressed = false): Promise<Buffer> {
  const secp = await import("@noble/secp256k1");
  const privKeyBytes = Buffer.from(privateKeyHex, "hex");
  try {
    return Buffer.from(secp.getPublicKey(privKeyBytes, compressed));
  } finally {
    privKeyBytes.fill(0);
  }
}

// ── Ed25519 helpers (Solana) ──────────────────────────────────────────────────

function ed25519Sign(privateKeyHex: string, message: Buffer): Buffer {
  const privKeyBytes = Buffer.from(privateKeyHex, "hex");
  try {
    const keyObj = createPrivateKey({
      key: buildEd25519Pkcs8Der(privKeyBytes),
      format: "der",
      type: "pkcs8",
    });
    return cryptoSign(null, message, keyObj);
  } finally {
    privKeyBytes.fill(0);
  }
}

function buildEd25519Pkcs8Der(rawPrivKey: Buffer): Buffer {
  // PKCS8 DER for Ed25519
  const oid = Buffer.from([0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70]);
  const privKeyWrapped = Buffer.concat([Buffer.from([0x04, 0x20]), rawPrivKey]);
  const privKeyOuter = Buffer.concat([Buffer.from([0x04, privKeyWrapped.length]), privKeyWrapped]);
  const version = Buffer.from([0x02, 0x01, 0x00]);
  const inner = Buffer.concat([version, oid, privKeyOuter]);
  return Buffer.concat([Buffer.from([0x30, inner.length]), inner]);
}

function ed25519GetPublicKey(privateKeyHex: string): Buffer {
  const privKeyBytes = Buffer.from(privateKeyHex, "hex");
  try {
    const keyObj = createPrivateKey({
      key: buildEd25519Pkcs8Der(privKeyBytes),
      format: "der",
      type: "pkcs8",
    });
    const pubKeyObj = createPublicKey(keyObj);
    const pubKeyDer = pubKeyObj.export({ type: "spki", format: "der" }) as Buffer;
    return pubKeyDer.slice(-32);
  } finally {
    privKeyBytes.fill(0);
  }
}

// ── EVM address derivation ────────────────────────────────────────────────────

async function evmAddressFromPrivKey(privateKeyHex: string): Promise<string> {
  const pubKey = await secp256k1GetPublicKey(privateKeyHex, false);
  const pubKeyBody = pubKey.slice(1); // Remove 0x04 prefix
  const { keccak_256 } = await import("@noble/hashes/sha3.js");
  const hash = keccak_256(pubKeyBody);
  return "0x" + Buffer.from(hash).slice(12).toString("hex");
}

// Bitcoin P2WPKH address from compressed public key
function btcP2WPKHAddress(publicKey: Buffer, network: "mainnet" | "testnet" = "mainnet"): string {
  const sha256Hash = createHash("sha256").update(publicKey).digest();
  const hash160 = createHash("ripemd160").update(sha256Hash).digest();
  return encodeBech32(network === "mainnet" ? "bc" : "tb", 0, hash160);
}

function encodeBech32(hrp: string, version: number, data: Buffer): string {
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const bits5: number[] = [];
  let value = 0;
  let bits = 0;
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      bits5.push((value >> bits) & 31);
    }
  }
  if (bits > 0) bits5.push((value << (5 - bits)) & 31);

  const converted = [version, ...bits5];

  function polymod(values: number[]): number {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        if ((b >> i) & 1) chk ^= GEN[i];
      }
    }
    return chk;
  }
  const hrpExpand = [...hrp].flatMap((c) => [c.charCodeAt(0) >> 5]).concat(
    0, ...[...hrp].map((c) => c.charCodeAt(0) & 31),
  );
  const checksumInput = [...hrpExpand, ...converted, 0, 0, 0, 0, 0, 0];
  const mod = polymod(checksumInput) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >> (5 * (5 - i))) & 31);
  return hrp + "1" + [...converted, ...checksum].map((d) => CHARSET[d]).join("");
}

// ── Environment key names ────────────────────────────────────────────────────

function envKeyName(chainId: ChainId, index = 0): string {
  const chain = chainId.toUpperCase().replace(/-/g, "_");
  return index === 0
    ? `WALLET_${chain}_PRIVATE_KEY`
    : `WALLET_${chain}_PRIVATE_KEY_${index}`;
}

function getPrivateKey(chainId: ChainId, index = 0): string | null {
  if (!isEnvironmentKeySignerAllowed()) {
    throw new CustodyGateError("environment_private_key_access_forbidden");
  }
  const key = process.env[envKeyName(chainId, index)];
  if (!key || key.length < 64) return null;
  return key.replace("0x", "").toLowerCase();
}

// ── Hot Wallet KeyStore ──────────────────────────────────────────────────────

export class HotWalletKeyStore implements KeyStore {
  readonly type: KeyStoreType = "hot_wallet";

  isConfigured(chainId: ChainId): boolean {
    if (!isEnvironmentKeySignerAllowed()) return false;
    return getPrivateKey(chainId) !== null;
  }

  async getAddress(chainId: ChainId, index = 0): Promise<string> {
    const privKey = getPrivateKey(chainId, index);
    if (!privKey) {
      throw new Error(
        `Hot wallet not configured for ${chainId}. Set env var: ${envKeyName(chainId, index)}`,
      );
    }

    if (chainId === "solana") {
      const pub = ed25519GetPublicKey(privKey);
      return base58Encode(pub);
    }

    if (chainId === "bitcoin") {
      const pubBytes = await secp256k1GetPublicKey(privKey, true);
      return btcP2WPKHAddress(pubBytes);
    }

    // EVM chains
    return evmAddressFromPrivKey(privKey);
  }

  async getPublicKey(chainId: ChainId, index = 0): Promise<Buffer> {
    const privKey = getPrivateKey(chainId, index);
    if (!privKey) {
      throw new Error(`Hot wallet not configured for ${chainId}`);
    }

    if (chainId === "solana") return ed25519GetPublicKey(privKey);
    return secp256k1GetPublicKey(privKey, chainId === "bitcoin");
  }

  async sign(chainId: ChainId, signingHash: Buffer, index = 0): Promise<Buffer> {
    const privKey = getPrivateKey(chainId, index);
    if (!privKey) {
      throw new Error(`Hot wallet not configured for ${chainId}`);
    }

    if (chainId === "solana") {
      return ed25519Sign(privKey, signingHash);
    }

    return secp256k1Sign(privKey, signingHash);
  }
}

// ── HSM KeyStore (stub — Phase 39) ───────────────────────────────────────────

export class HsmKeyStore implements KeyStore {
  readonly type: KeyStoreType = "hsm";

  isConfigured(_chainId: ChainId): boolean {
    return !!(process.env.HSM_ENDPOINT && process.env.HSM_KEY_ID);
  }

  async getAddress(_chainId: ChainId, _index?: number): Promise<string> {
    throw new Error("HSM integration not implemented (Phase 39)");
  }

  async getPublicKey(_chainId: ChainId, _index?: number): Promise<Buffer> {
    throw new Error("HSM integration not implemented (Phase 39)");
  }

  async sign(_chainId: ChainId, _hash: Buffer, _index?: number): Promise<Buffer> {
    throw new Error("HSM integration not implemented (Phase 39)");
  }
}

// ── MPC KeyStore (stub — Phase 40) ───────────────────────────────────────────

export class MpcKeyStore implements KeyStore {
  readonly type: KeyStoreType = "mpc";

  isConfigured(_chainId: ChainId): boolean {
    return !!(process.env.MPC_ENDPOINT && process.env.MPC_PARTY_ID);
  }

  async getAddress(_chainId: ChainId, _index?: number): Promise<string> {
    throw new Error("MPC integration not implemented (Phase 40)");
  }

  async getPublicKey(_chainId: ChainId, _index?: number): Promise<Buffer> {
    throw new Error("MPC integration not implemented (Phase 40)");
  }

  async sign(_chainId: ChainId, _hash: Buffer, _index?: number): Promise<Buffer> {
    throw new Error("MPC integration not implemented (Phase 40)");
  }
}

// ── Simulation KeyStore (testing only) ───────────────────────────────────────

export class SimulatedKeyStore implements KeyStore {
  readonly type: KeyStoreType = "hot_wallet";
  private readonly fixedKey: Buffer;

  constructor() {
    if (!isSimulationSignerAllowed()) {
      throw new CustodyGateError("simulation_custody_not_allowed");
    }
    this.fixedKey = Buffer.from(
      "0000000000000000000000000000000000000000000000000000000000000001",
      "hex",
    );
  }

  isConfigured(_chainId: ChainId): boolean {
    return process.env.NODE_ENV !== "production";
  }

  async getAddress(chainId: ChainId, _index = 0): Promise<string> {
    if (chainId === "ethereum" || chainId === "bsc" || chainId === "polygon") {
      return "0x742d35Cc6634C0532925a3b8D4C9b1B4f9a8e2a";
    }
    if (chainId === "bitcoin") {
      return "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
    }
    if (chainId === "solana") {
      return "11111111111111111111111111111112";
    }
    if (chainId === "tron") {
      return "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";
    }
    throw new Error(`SimulatedKeyStore: unsupported chain ${chainId}`);
  }

  async getPublicKey(chainId: ChainId, _index = 0): Promise<Buffer> {
    const fixedKeyHex = this.fixedKey.toString("hex");
    if (chainId === "solana") return ed25519GetPublicKey(fixedKeyHex);
    return secp256k1GetPublicKey(fixedKeyHex, chainId === "bitcoin");
  }

  async sign(_chainId: ChainId, signingHash: Buffer, _index = 0): Promise<Buffer> {
    const fakeSig = createHash("sha256").update(signingHash).update(this.fixedKey).digest();
    return Buffer.concat([fakeSig, fakeSig.slice(0, 32)]);
  }
}

// ── KeyStore Factory ─────────────────────────────────────────────────────────

export function createKeyStore(): KeyStore {
  const status = getCustodyRuntimeStatus();
  if (!status.configurationValid) {
    throw new CustodyConfigurationError(status.errors);
  }

  if (status.mode === "simulation") return new SimulatedKeyStore();
  if (status.mode === "dev_hot_wallet") {
    const hotWallet = new HotWalletKeyStore();
    if (!status.enabledChains.some((chain) => hotWallet.isConfigured(chain as ChainId))) {
      throw new CustodyGateError("development_hot_wallet_chain_key_missing");
    }
    return hotWallet;
  }
  if (status.mode === "external_hsm") {
    throw new CustodyGateError("hsm_signer_not_implemented");
  }
  if (status.mode === "external_mpc") {
    throw new CustodyGateError("mpc_signer_not_implemented");
  }
  throw new CustodyGateError("custody_launch_gate_disabled");
}

// ── Base58 encode (Solana address) ───────────────────────────────────────────

const B58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(buf: Buffer): string {
  let n = BigInt("0x" + buf.toString("hex"));
  let result = "";
  while (n > BigInt(0)) {
    result = B58_CHARS[Number(n % BigInt(58))] + result;
    n = n / BigInt(58);
  }
  for (const byte of buf) {
    if (byte !== 0) break;
    result = "1" + result;
  }
  return result;
}
