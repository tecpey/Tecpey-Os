import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("educational market decoration stays within its mobile container", () => {
  const landing = readFileSync("src/app/home/enterprise/TecpeyEnterpriseLanding.tsx", "utf8");
  const device = landing.slice(landing.indexOf("function DeviceFrame()"), landing.indexOf("function Hero()"));
  assert.doesNotMatch(device, /-inset-6/);
  assert.match(device, /aria-hidden="true" className="pointer-events-none absolute inset-0/);
  assert.match(device, /flex min-w-0 items-center gap-3/);
  assert.match(device, /h-10 w-10 shrink-0/);
});
