import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registryPath = "docs/architecture/TECPEY_CONTENT_AUTOMATION_OS_V1.md";
const registry = readFileSync(registryPath, "utf8");

test("content automation registry preserves draft-only safety mode", () => {
  assert.match(registry, /draft-only architecture/i);
  assert.match(registry, /no auto-publish/i);
  assert.match(registry, /Human review required/i);
  assert.match(registry, /Current v1 must stay draft_only\/manual_review_required/i);
});

test("content automation registry preserves destination coverage", () => {
  for (const destination of [
    "TecPey News",
    "Daily News Archive",
    "Trend Intelligence",
    "Coin pages",
    "Tool pages",
    "Mentor context",
    "Academy quiz ideas",
    "Term 8",
    "Telegram post draft",
    "X post draft",
    "LinkedIn post draft",
    "Instagram carousel/reel script draft",
    "Shorts/Reels script draft",
    "Internal admin alert",
  ]) {
    assert.ok(registry.includes(destination), `missing destination: ${destination}`);
  }
});

test("content automation registry preserves quality and safety gates", () => {
  for (const required of [
    "source URL required",
    "numeric fact preservation",
    "no invented numeric facts",
    "no unsupported Latin entities",
    "directionality isolation",
    "no direct buy/sell command",
    "no guaranteed return",
    "no individualized investment advice",
    "trend” means research lead, not trading signal",
  ]) {
    assert.ok(registry.includes(required), `missing gate: ${required}`);
  }
});

test("content automation registry preserves staging QA backlog", () => {
  for (const required of [
    "iPhone 13 signup viewport is clipped/off-canvas",
    "Mannan or crypto_mannan",
    "Move Iranian mobile verification into identity/KYC",
    "Connect real Google and Apple sign-in",
    "Current table clips horizontally on mobile",
    "env(safe-area-inset-bottom)",
    "Make score labels explicit",
    "rate-limit Redis production requirement",
    "optional navbar profile 404",
  ]) {
    assert.ok(registry.includes(required), `missing backlog item: ${required}`);
  }
});
