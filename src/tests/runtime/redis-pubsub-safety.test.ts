import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import type { Redis } from "ioredis";
import {
  RedisPubSubManager,
  type RedisClientFactory,
} from "@/lib/redis-pubsub";

class FakeRedis extends EventEmitter {
  pingFailure: Error | null = null;
  subscribeFailure: Error | null = null;
  registrationFailure: Error | null = null;
  discoveryFailure: Error | null = null;
  discoveryCount: unknown = 1;
  subscribedChannels: string[] = [];
  registrationCalls = 0;
  deregistrationCalls = 0;
  publishCalls = 0;
  quitCalls = 0;
  disconnectCalls = 0;

  async ping(): Promise<string> {
    if (this.pingFailure) throw this.pingFailure;
    return "PONG";
  }

  async subscribe(...channels: string[]): Promise<number> {
    if (this.subscribeFailure) throw this.subscribeFailure;
    this.subscribedChannels = channels;
    return channels.length;
  }

  async zadd(): Promise<number> {
    this.registrationCalls++;
    if (this.registrationFailure) throw this.registrationFailure;
    return 1;
  }

  async eval(): Promise<unknown> {
    if (this.discoveryFailure) throw this.discoveryFailure;
    return this.discoveryCount;
  }

  async zrem(): Promise<number> {
    this.deregistrationCalls++;
    return 1;
  }

  async publish(): Promise<number> {
    this.publishCalls++;
    return 1;
  }

  async quit(): Promise<string> {
    this.quitCalls++;
    return "OK";
  }

  disconnect(): void {
    this.disconnectCalls++;
  }
}

function createFactory(pub: FakeRedis, sub: FakeRedis): {
  factory: RedisClientFactory;
  calls: () => number;
} {
  let count = 0;
  return {
    factory: (() => {
      const client = count === 0 ? pub : sub;
      count++;
      return client as unknown as Redis;
    }) as RedisClientFactory,
    calls: () => count,
  };
}

function createManager(options?: {
  pub?: FakeRedis;
  sub?: FakeRedis;
}): {
  manager: RedisPubSubManager;
  pub: FakeRedis;
  sub: FakeRedis;
  factoryCalls: () => number;
} {
  const pub = options?.pub ?? new FakeRedis();
  const sub = options?.sub ?? new FakeRedis();
  const factory = createFactory(pub, sub);
  return {
    manager: new RedisPubSubManager(factory.factory),
    pub,
    sub,
    factoryCalls: factory.calls,
  };
}

describe("Redis production safety authority", () => {
  it("requires ping, subscription, registration and discovery before readiness", async () => {
    const { manager, pub, sub } = createManager();

    const result = await manager.initialize("redis://example.test:6379");

    assert.equal(result.ok, true);
    assert.equal(result.activeWebNodes, 1);
    assert.equal(result.subscribedChannels, 5);
    assert.equal(manager.isReady(), true);
    assert.equal(manager.getHealth().state, "ready");
    assert.equal(pub.registrationCalls, 1);
    assert.equal(sub.subscribedChannels.length, 5);

    await manager.shutdown();
    assert.equal(pub.deregistrationCalls, 1);
    assert.equal(pub.quitCalls, 1);
    assert.equal(sub.quitCalls, 1);
    assert.equal(manager.getHealth().state, "stopped");
  });

  it("is idempotent and does not create duplicate clients on repeated initialize", async () => {
    const { manager, factoryCalls } = createManager();

    const first = await manager.initialize("redis://example.test:6379");
    const second = await manager.initialize("redis://example.test:6379");

    assert.equal(first.nodeId, second.nodeId);
    assert.equal(factoryCalls(), 2);
    await manager.shutdown();
  });

  it("fails closed when the publisher or subscriber cannot PING", async () => {
    for (const failingSide of ["publisher", "subscriber"] as const) {
      const pub = new FakeRedis();
      const sub = new FakeRedis();
      if (failingSide === "publisher") pub.pingFailure = new Error("connection_refused");
      else sub.pingFailure = new Error("bad_password");
      const { manager } = createManager({ pub, sub });

      await assert.rejects(
        manager.initialize("redis://example.test:6379"),
        /redis_initialization_failed/,
      );
      assert.equal(manager.isReady(), false);
      assert.equal(manager.getHealth().state, "failed");
    }
  });

  it("fails closed when channel subscription is incomplete or rejected", async () => {
    const rejectedSub = new FakeRedis();
    rejectedSub.subscribeFailure = new Error("subscription_denied");
    const rejected = createManager({ sub: rejectedSub });
    await assert.rejects(
      rejected.manager.initialize("redis://example.test:6379"),
      /redis_initialization_failed/,
    );

    class PartialSubscriptionRedis extends FakeRedis {
      override async subscribe(...channels: string[]): Promise<number> {
        this.subscribedChannels = channels;
        return channels.length - 1;
      }
    }
    const partial = createManager({ sub: new PartialSubscriptionRedis() });
    await assert.rejects(
      partial.manager.initialize("redis://example.test:6379"),
      /redis_subscription_incomplete/,
    );
  });

  it("fails closed when node registration or discovery cannot be verified", async () => {
    const registrationPub = new FakeRedis();
    registrationPub.registrationFailure = new Error("write_denied");
    const registration = createManager({ pub: registrationPub });
    await assert.rejects(
      registration.manager.initialize("redis://example.test:6379"),
      /redis_initialization_failed/,
    );

    const discoveryPub = new FakeRedis();
    discoveryPub.discoveryFailure = new Error("read_timeout");
    const discovery = createManager({ pub: discoveryPub });
    await assert.rejects(
      discovery.manager.initialize("redis://example.test:6379"),
      /redis_node_discovery_failed/,
    );

    const invalidPub = new FakeRedis();
    invalidPub.discoveryCount = "not-a-count";
    const invalid = createManager({ pub: invalidPub });
    await assert.rejects(
      invalid.manager.initialize("redis://example.test:6379"),
      /redis_node_discovery_invalid_result/,
    );
  });

  it("returns an explicit unavailable discovery result instead of a safe-looking sentinel", async () => {
    const { manager } = createManager();
    assert.deepEqual(await manager.countActiveWebNodes(), {
      ok: false,
      reason: "redis_node_discovery_unavailable",
    });
  });

  it("surfaces the verified node count for the server single-node policy", async () => {
    const pub = new FakeRedis();
    pub.discoveryCount = 2;
    const { manager } = createManager({ pub });

    const result = await manager.initialize("redis://example.test:6379");
    assert.equal(result.activeWebNodes, 2);
    assert.equal(manager.getHealth().activeWebNodes, 2);
    await manager.shutdown();
  });

  it("marks runtime Redis loss degraded and invokes the fatal handler exactly once", async () => {
    const { manager, pub, sub } = createManager();
    const reasons: string[] = [];
    manager.setFatalHandler((reason) => reasons.push(reason));
    await manager.initialize("redis://example.test:6379");

    pub.emit("close");
    sub.emit("error", new Error("subscriber_lost"));

    assert.equal(manager.isReady(), false);
    assert.equal(manager.getHealth().state, "degraded");
    assert.deepEqual(reasons, ["redis_publisher_closed"]);
    await manager.shutdown();
  });
});
