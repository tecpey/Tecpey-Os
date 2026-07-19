import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashExchangeOrderCommand,
  type ExchangeOrderAdmissionInput,
} from "../../lib/trading/order-command-service";

function command(
  overrides: Partial<ExchangeOrderAdmissionInput> = {},
): ExchangeOrderAdmissionInput {
  return {
    tenantId: "tecpey",
    userId: "user-1",
    idempotencyKey: "exchange-order-test-0001",
    request: {
      market: "BTCUSDT",
      side: "buy",
      type: "limit",
      quantity: "0.01000",
      price: "1000.00",
      timeInForce: "GTC",
      clientOrderId: "client-order-test-0001",
    },
    hold: { asset: "USDT", amount: "10.0000000000" },
    ...overrides,
  };
}

describe("Exchange order command identity", () => {
  it("produces a stable canonical hash independent of object insertion order", () => {
    const first = command();
    const second: ExchangeOrderAdmissionInput = {
      hold: { amount: "10.0000000000", asset: "USDT" },
      request: {
        clientOrderId: "client-order-test-0001",
        timeInForce: "GTC",
        price: "1000.00",
        quantity: "0.01000",
        type: "limit",
        side: "buy",
        market: "BTCUSDT",
      },
      idempotencyKey: "exchange-order-test-0001",
      userId: "user-1",
      tenantId: "tecpey",
    };
    assert.equal(hashExchangeOrderCommand(first), hashExchangeOrderCommand(second));
  });

  it("changes identity when any financial or principal fact changes", () => {
    const base = command();
    const hashes = new Set([
      hashExchangeOrderCommand(base),
      hashExchangeOrderCommand(command({ userId: "user-2" })),
      hashExchangeOrderCommand(command({ tenantId: "tenant-2" })),
      hashExchangeOrderCommand(command({
        request: { ...base.request, quantity: "0.02000" },
      })),
      hashExchangeOrderCommand(command({
        hold: { ...base.hold, amount: "20.0000000000" },
      })),
    ]);
    assert.equal(hashes.size, 5);
  });
});
