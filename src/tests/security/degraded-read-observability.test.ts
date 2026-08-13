import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

import { DEGRADED_READ_COUNTER, recordDegradedRead } from "../../lib/degraded-read";
import { metrics } from "../../lib/metrics";
import { STUDENT_SESSION_COOKIE } from "../../lib/academy-session";

// Several academy read routes deliberately answer 200 with fallback content
// when their storage is unreachable, so an outage degrades the page instead of
// breaking it. That is only honest if the degradation is observable: the
// response must say `degraded: true` and the server must emit a metric, so an
// outage can never masquerade as "this student has no achievements".

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = "tecpey-degraded-read-test-secret-32-chars";

async function studentCookie(): Promise<string> {
  const token = await new SignJWT({ role: "student" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(randomUUID())
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(SESSION_SECRET));
  return `${STUDENT_SESSION_COOKIE}=${token}`;
}

function counterFor(route: string): number {
  const counters = metrics.getSnapshot().counters;
  return counters[`${DEGRADED_READ_COUNTER}:${route}`] ?? 0;
}

beforeEach(() => {
  metrics.reset();
  process.env.TECPEY_SESSION_SECRET = SESSION_SECRET;
  // Force withDb() to report the pool as unavailable, which is exactly the
  // condition these routes translate into fallback content.
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  metrics.reset();
});

describe("Degraded read observability", () => {
  it("records a per-route error, a shared counter and a warn-level signal", () => {
    const errors: unknown[] = [];
    const originalWarn = console.warn;
    console.warn = (line: unknown) => errors.push(line);
    try {
      recordDegradedRead("/api/example", "storage_unavailable");
      recordDegradedRead("/api/example", "read_failed", new Error("connection reset"));
    } finally {
      console.warn = originalWarn;
    }

    const snapshot = metrics.getSnapshot();
    assert.equal(snapshot.counters[DEGRADED_READ_COUNTER], 2);
    assert.equal(snapshot.counters[`${DEGRADED_READ_COUNTER}:/api/example`], 2);
    assert.equal(snapshot.routes.errors["/api/example:degraded:storage_unavailable"]?.total, 1);
    assert.equal(snapshot.routes.errors["/api/example:degraded:read_failed"]?.total, 1);

    assert.equal(errors.length, 2);
    const second = JSON.parse(String(errors[1])) as Record<string, unknown>;
    assert.equal(second.level, "warn");
    assert.equal(second.route, "/api/example");
    assert.equal(second.reason, "read_failed");
    assert.equal(second.error, "connection reset");
  });

  it("marks an achievement read as degraded instead of reporting an empty record", async () => {
    const { GET } = await import("../../app/api/achievements/route");
    const response = await GET(
      new NextRequest("https://tecpey.ir/api/achievements?locale=fa", {
        headers: { cookie: await studentCookie() },
      }),
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.authenticated, true);
    assert.equal(body.degraded, true);
    assert.ok(Array.isArray(body.achievements));
    assert.equal(counterFor("/api/achievements"), 1);
  });

  it("marks a certificate read as degraded rather than claiming none is recorded", async () => {
    const { GET } = await import("../../app/api/academy-certificates/route");
    const response = await GET(
      new NextRequest("https://tecpey.ir/api/academy-certificates", {
        headers: { cookie: await studentCookie() },
      }),
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.degraded, true);
    assert.deepEqual(body.certificates, []);
    assert.equal(counterFor("/api/academy-certificates"), 1);
  });

  it("marks a mentor challenge as degraded when the question bank is unreachable", async () => {
    const { GET } = await import("../../app/api/mentor-challenge/route");
    const response = await GET(
      new NextRequest("https://tecpey.ir/api/mentor-challenge?locale=fa&termNumber=2"),
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as { degraded?: boolean; question?: { id?: string } };
    assert.equal(body.degraded, true);
    assert.ok(body.question?.id?.startsWith("fallback-"));
    assert.equal(counterFor("/api/mentor-challenge"), 1);
  });

  it("does not mark an unauthenticated certificate read as degraded", async () => {
    const { GET } = await import("../../app/api/academy-certificates/route");
    const response = await GET(new NextRequest("https://tecpey.ir/api/academy-certificates"));

    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.degraded, false);
    assert.equal(counterFor("/api/academy-certificates"), 0);
  });
});
