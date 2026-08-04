import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MENTOR_KNOWLEDGE,
  MENTOR_QUICK_QUESTIONS,
  buildMentorCoaching,
  detectMentorMode,
  toLocalReply,
  type MentorLocale,
  type MentorMode,
} from "../../lib/academy-ai-mentor-core";
import { PROHIBITED_CLAIM_PATTERN } from "../../lib/academy-news-quiz-generator";

// The mentor core is the deterministic, guard-railed brain shared by the AI
// Mentor page and the news-quiz board. Its whole promise is safety: it teaches
// process, security and risk and must NEVER emit a profit promise or price
// prediction. These tests pin that promise, plus the routing and shape
// contracts the two surfaces depend on.

const LOCALES: MentorLocale[] = ["fa", "en"];
const MODES: MentorMode[] = ["concept", "security", "risk", "trading", "project", "psychology"];

function everyString(): { locale: MentorLocale; mode: MentorMode; text: string }[] {
  const out: { locale: MentorLocale; mode: MentorMode; text: string }[] = [];
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const k = MENTOR_KNOWLEDGE[locale][mode];
      for (const text of [k.title, ...k.body, ...k.checklist, k.next]) {
        out.push({ locale, mode, text });
      }
    }
    for (const text of MENTOR_QUICK_QUESTIONS[locale]) out.push({ locale, mode: "concept", text });
  }
  return out;
}

describe("AI mentor core", () => {
  it("never emits profit-promise or price-prediction language, in either locale", () => {
    // Same gate that guards the news-quiz generator: the mentor content is held
    // to the identical no-hype standard.
    for (const { locale, mode, text } of everyString()) {
      assert.doesNotMatch(
        text,
        PROHIBITED_CLAIM_PATTERN,
        `mentor ${locale}/${mode} copy must be hype-free: "${text}"`,
      );
    }
  });

  it("covers every mode in both locales with a well-formed knowledge entry", () => {
    for (const locale of LOCALES) {
      for (const mode of MODES) {
        const k = MENTOR_KNOWLEDGE[locale][mode];
        assert.ok(k.title.trim().length > 0, `${locale}/${mode} needs a title`);
        assert.equal(k.body.length, 2, `${locale}/${mode} needs two body paragraphs`);
        assert.equal(k.checklist.length, 4, `${locale}/${mode} needs a four-item checklist`);
        assert.ok(k.term >= 1 && k.term <= 7, `${locale}/${mode} term must be 1-7`);
      }
    }
  });

  it("routes signal words to the right mode, bilingually", () => {
    assert.equal(detectMentorMode("How do I protect my Seed Phrase?"), "security");
    assert.equal(detectMentorMode("Seed Phrase را چطور امن نگه دارم؟"), "security");
    assert.equal(detectMentorMode("How much should I risk per trade?"), "risk");
    assert.equal(detectMentorMode("حد ضرر را کجا بگذارم؟"), "risk");
    assert.equal(detectMentorMode("Is RSI at 82 a sell?"), "trading");
    assert.equal(detectMentorMode("FDV و tokenomics چیست؟"), "project");
    assert.equal(detectMentorMode("I feel FOMO and greed before buying"), "psychology");
    assert.equal(detectMentorMode("Just explain the concept simply"), "concept");
  });

  it("buildMentorCoaching returns curated copy with a locale-correct lesson link", () => {
    const fa = buildMentorCoaching("چطور Seed Phrase را امن نگه دارم؟", "fa");
    assert.equal(fa.mode, "security");
    assert.ok(fa.lesson.href.startsWith("/academy/term-"), "fa lesson link uses the fa prefix");
    assert.equal(fa.checklist.length, 4);

    const en = buildMentorCoaching("How do I size my risk?", "en");
    assert.equal(en.mode, "risk");
    assert.ok(en.lesson.href.startsWith("/en/academy/term-"), "en lesson link uses the en prefix");
    assert.match(en.title, /[A-Za-z]/, "en coaching is in English");
  });

  it("does not echo the caller's text into the coaching (no injection surface)", () => {
    // A hype-laden subject must not leak into the coaching output: coaching is
    // keyed by mode and returns curated copy only.
    const hype = "Bitcoin will 10x and reach $1 million guaranteed";
    for (const locale of LOCALES) {
      const coaching = buildMentorCoaching(hype, locale);
      const blob = [coaching.title, coaching.summary, ...coaching.checklist, coaching.lesson.title].join("  ");
      assert.doesNotMatch(blob, PROHIBITED_CLAIM_PATTERN);
      assert.ok(!blob.includes("10x") && !blob.includes("$1 million"), "caller text is never echoed back");
    }
  });

  it("toLocalReply builds a fail-closed fallback reply with an answer and checklist", () => {
    for (const locale of LOCALES) {
      const reply = toLocalReply(MENTOR_QUICK_QUESTIONS[locale][0], locale);
      assert.ok(reply.answer.trim().length > 0, "the fallback always has an answer");
      assert.ok((reply.checklist ?? []).length > 0, "the fallback carries a checklist");
      assert.ok(reply.relatedTerm?.href, "the fallback links a related term");
      assert.doesNotMatch(reply.answer, PROHIBITED_CLAIM_PATTERN);
    }
  });
});
