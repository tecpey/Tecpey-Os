import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PERSIAN_NEWSROOM_STYLE_INSTRUCTIONS } from "../../lib/ai/persian-newsroom-style";

describe("Persian newsroom style authority", () => {
  it("requires idiomatic Persian while preserving semantic agency and source facts", () => {
    const instructions = PERSIAN_NEWSROOM_STYLE_INSTRUCTIONS.join(" ");

    assert.match(instructions, /do not translate sentence by sentence/i);
    assert.match(instructions, /Preserve semantic agency exactly/i);
    assert.match(instructions, /Never turn creating or cloning chatbot versions of people into transforming the people themselves/i);
    assert.match(instructions, /one concise Persian newsroom sentence or clause/i);
    assert.match(instructions, /Do not append a second sentence/i);
    assert.match(instructions, /source number, ticker, or reporting-period fact/i);
    assert.match(instructions, /vague clickbait references/i);
    assert.match(instructions, /Avoid English clause order and long comma-chain syntax/i);
    assert.match(instructions, /intended meaning rather than literal word equivalents/i);
    assert.match(instructions, /never invent or mutate an entity/i);
  });

  it("keeps the style contract compact enough to avoid material prompt-cost inflation", () => {
    const instructions = PERSIAN_NEWSROOM_STYLE_INSTRUCTIONS.join(" ");
    assert.ok(instructions.length > 500);
    assert.ok(instructions.length < 2_000);
  });
});
