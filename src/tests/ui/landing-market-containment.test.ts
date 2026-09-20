import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("educational market snapshot stays within its mobile container", () => {
  const landing = readFileSync(
    "src/app/home/enterprise/TecpeyEnterpriseLanding.tsx",
    "utf8",
  );
  const start = landing.indexOf("function MarketLearningSnapshot()");
  const end = landing.indexOf("\nexport default function TecpeyEnterpriseLanding", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const snapshot = landing.slice(start, end);

  assert.doesNotMatch(snapshot, /-inset-/);
  assert.doesNotMatch(snapshot, /overflow-x-auto/);
  assert.match(snapshot, /overflow-hidden rounded-\[28px\]/);
  assert.match(snapshot, /grid sm:grid-cols-2/);
  assert.match(snapshot, /grid-cols-\[42px_1fr_auto\]/);
  assert.match(snapshot, /min-w-0/);
  assert.match(snapshot, /tabular-nums/);
});


test("product-led hero reserves enough mobile vertical space", () => {
  const css = readFileSync(
    "src/components/home/calm-entry.module.css",
    "utf8",
  );
  const mobile = css.slice(
    css.indexOf("@media (max-width: 760px)"),
    css.indexOf("@media (max-width: 420px)"),
  );

  assert.match(mobile, /\.visual \{ aspect-ratio: auto; height: clamp\(430px, 112vw, 560px\); \}/);
  assert.doesNotMatch(mobile, /\.visual \{ aspect-ratio: 1\.7; \}/);
  assert.match(mobile, /430px/);
});
