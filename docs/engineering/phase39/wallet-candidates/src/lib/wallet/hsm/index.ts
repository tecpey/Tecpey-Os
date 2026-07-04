// HSM Factory & Circuit Breaker — Phase 39

import type { ChainId } from "../types";
import type { HsmHealth, HsmKeyHandle, HsmProvider, HsmSignRequest, HsmSignResponse } from "./types";

export type { HsmProvider, HsmKeyHandle, HsmSignRequest, HsmSignResponse, HsmHealth };
export { AwsCloudHsmProvider } from "./aws-cloudhsm";
export { ThalesHsmProvider } from "./thales";
export { LocalDevelopmentHsm } from "./local-dev";

// ── Circuit Breaker ──────────────────────────────────────────────────────────

type CircuitState = "closed" | "open" | "half-open";

class HsmCircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private lastFailureAt = 0;

  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(threshold = 3, cooldownMs = 30_000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  canCall(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailureAt;
      if (elapsed >= this.cooldownMs) {
        this.state = "half-open";
        return true;
      }
      return false;
    }
    return true; // half-open: allow one probe
  }

  onSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  onFailure(): void {
    this.failures++;
    this.lastFailureAt = Date.now();
    if (this.failures >= this.threshold) {
      this.state = "open";
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// ── Resilient HSM Wrapper ─────────────────────────────────────────────────────

class ResilientHsmProvider implements HsmProvider {
  readonly name: string;
  private readonly breaker = new HsmCircuitBreaker(3, 30_000);

  constructor(private readonly inner: HsmProvider) {
    this.name = `resilient:${inner.name}`;
  }

  async healthCheck(): Promise<HsmHealth> {
    return this.inner.healthCheck();
  }

  async listKeys(): Promise<HsmKeyHandle[]> {
    return this.inner.listKeys();
  }

  async getKey(chainId: ChainId): Promise<HsmKeyHandle | null> {
    return this.inner.getKey(chainId);
  }

  async getPublicKey(handle: HsmKeyHandle): Promise<Buffer> {
    return this.inner.getPublicKey(handle);
  }

  async sign(request: HsmSignRequest): Promise<HsmSignResponse> {
    if (!this.breaker.canCall()) {
      throw new Error(`HSM circuit breaker open for provider: ${this.inner.name}`);
    }
    try {
      const result = await this.inner.sign(request);
      this.breaker.onSuccess();
      return result;
    } catch (err) {
      this.breaker.onFailure();
      throw err;
    }
  }

  async getAddress(handle: HsmKeyHandle): Promise<string> {
    return this.inner.getAddress(handle);
  }

  getCircuitState(): CircuitState {
    return this.breaker.getState();
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

let _instance: ResilientHsmProvider | null = null;

export function getHsmProvider(): ResilientHsmProvider | null {
  if (_instance) return _instance;

  const providerName = process.env.HSM_PROVIDER;
  let raw: HsmProvider | null = null;

  if (providerName === "aws-cloudhsm" && process.env.AWS_CLOUDHSM_CLUSTER_ID) {
    const { AwsCloudHsmProvider } = require("./aws-cloudhsm");
    raw = new AwsCloudHsmProvider();
  } else if (providerName === "thales" && process.env.THALES_HSM_HOST) {
    const { ThalesHsmProvider } = require("./thales");
    raw = new ThalesHsmProvider();
  } else if (providerName === "local-dev" && process.env.NODE_ENV !== "production") {
    const { LocalDevelopmentHsm } = require("./local-dev");
    raw = new LocalDevelopmentHsm();
  }

  if (!raw) return null;
  _instance = new ResilientHsmProvider(raw);
  return _instance;
}

export function resetHsmProviderSingleton(): void {
  _instance = null;
}
