// RPC Client with failover — Phase 38
// HTTP JSON-RPC client with automatic endpoint failover, circuit breaker, and retry.
//
// Circuit breaker: after 3 failures → mark endpoint as unhealthy → try next
// Recovery: after RECOVERY_WINDOW_MS without use → attempt health check

import { logger } from "@/lib/logger";
import type { ChainId } from "../types";

const MAX_FAILURES_BEFORE_CIRCUIT = 3;
const RECOVERY_WINDOW_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

type EndpointState = {
  url: string;
  failures: number;
  lastFailure: number;
  circuitOpen: boolean;
};

// ── Default RPC endpoints per chain ──────────────────────────────────────────

function defaultEndpoints(chainId: ChainId): string[] {
  const env = (key: string) => process.env[key];

  switch (chainId) {
    case "bitcoin":
      return [
        env("BTC_RPC_URL_1") ?? "",
        env("BTC_RPC_URL_2") ?? "",
      ].filter(Boolean);

    case "ethereum":
      return [
        env("ETH_RPC_URL_1") ?? "",
        env("ETH_RPC_URL_2") ?? "",
        env("ETH_RPC_URL_3") ?? "",
      ].filter(Boolean);

    case "bsc":
      return [
        env("BSC_RPC_URL_1") ?? "https://bsc-dataseed1.binance.org",
        env("BSC_RPC_URL_2") ?? "https://bsc-dataseed2.binance.org",
      ].filter(Boolean);

    case "polygon":
      return [
        env("POLYGON_RPC_URL_1") ?? "",
        env("POLYGON_RPC_URL_2") ?? "",
      ].filter(Boolean);

    case "tron":
      return [
        env("TRON_RPC_URL_1") ?? "https://api.trongrid.io",
        env("TRON_RPC_URL_2") ?? "https://api.shasta.trongrid.io",
      ].filter(Boolean);

    case "solana":
      return [
        env("SOLANA_RPC_URL_1") ?? "https://api.mainnet-beta.solana.com",
        env("SOLANA_RPC_URL_2") ?? "https://solana-api.projectserum.com",
      ].filter(Boolean);

    default:
      return [];
  }
}

// ── RPC Client ────────────────────────────────────────────────────────────────

export class RpcClient {
  private readonly endpoints: EndpointState[];
  private readonly chainId: ChainId;
  private readonly timeoutMs: number;

  constructor(chainId: ChainId, customEndpoints?: string[], timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.chainId = chainId;
    this.timeoutMs = timeoutMs;
    const urls = customEndpoints ?? defaultEndpoints(chainId);
    if (urls.length === 0) {
      logger.warn("[rpc] no endpoints configured", { chainId });
    }
    this.endpoints = urls.map((url) => ({
      url,
      failures: 0,
      lastFailure: 0,
      circuitOpen: false,
    }));
  }

  private getHealthyEndpoint(): EndpointState | null {
    const now = Date.now();
    for (const ep of this.endpoints) {
      if (ep.circuitOpen) {
        // Try to recover
        if (now - ep.lastFailure > RECOVERY_WINDOW_MS) {
          ep.circuitOpen = false;
          ep.failures = 0;
          logger.info("[rpc] circuit recovered", { url: ep.url, chainId: this.chainId });
        } else {
          continue;
        }
      }
      return ep;
    }
    return null;
  }

  private markFailure(ep: EndpointState): void {
    ep.failures++;
    ep.lastFailure = Date.now();
    if (ep.failures >= MAX_FAILURES_BEFORE_CIRCUIT) {
      ep.circuitOpen = true;
      logger.warn("[rpc] circuit opened", { url: ep.url, chainId: this.chainId, failures: ep.failures });
    }
  }

  private markSuccess(ep: EndpointState): void {
    ep.failures = 0;
    ep.circuitOpen = false;
  }

  /** Execute a JSON-RPC 2.0 call with automatic failover and retry. */
  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    let lastError: Error = new Error("No RPC endpoints configured");

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const ep = this.getHealthyEndpoint();
      if (!ep) {
        throw new Error(`[rpc] all endpoints unhealthy for ${this.chainId}`);
      }

      const delay = attempt > 0 ? RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) : 0;
      if (delay > 0) await sleep(delay);

      try {
        const result = await this.callEndpoint<T>(ep, method, params);
        this.markSuccess(ep);
        return result;
      } catch (err) {
        this.markFailure(ep);
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.debug("[rpc] call failed, retrying", {
          chainId: this.chainId,
          method,
          attempt,
          error: lastError.message,
        });
      }
    }

    throw lastError;
  }

  private async callEndpoint<T>(ep: EndpointState, method: string, params: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${ep.url}`);
      }

      const json = await res.json() as { result?: T; error?: { message: string } };

      if (json.error) {
        throw new Error(`RPC error: ${json.error.message}`);
      }

      return json.result as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** HTTP GET for REST-style endpoints (TRON, Solana) */
  async get<T>(path: string): Promise<T> {
    const ep = this.getHealthyEndpoint();
    if (!ep) throw new Error(`No healthy endpoints for ${this.chainId}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = ep.url.replace(/\/$/, "") + path;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** HTTP POST for REST-style endpoints */
  async post<T>(path: string, body: unknown): Promise<T> {
    const ep = this.getHealthyEndpoint();
    if (!ep) throw new Error(`No healthy endpoints for ${this.chainId}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = ep.url.replace(/\/$/, "") + path;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  getEndpointCount(): number {
    return this.endpoints.length;
  }

  getHealthyCount(): number {
    return this.endpoints.filter((e) => !e.circuitOpen).length;
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────

const clients = new Map<ChainId, RpcClient>();

export function getRpcClient(chainId: ChainId): RpcClient {
  if (!clients.has(chainId)) {
    clients.set(chainId, new RpcClient(chainId));
  }
  return clients.get(chainId)!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
