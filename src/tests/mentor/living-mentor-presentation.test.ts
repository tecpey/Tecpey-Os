import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import {
  LIVING_MENTOR_ACTS,
  selectLivingMentorAct,
} from "@/lib/living-mentor-presentation";

describe("Living Mentor presentation boundary", () => {
  it("keeps the host act vocabulary aligned with the governed Rive manifest", async () => {
    const manifest = JSON.parse(
      await readFile(
        path.join(
          process.cwd(),
          "docs/mentor/rig/tecpey-mentor-rig-manifest.v1.json",
        ),
        "utf8",
      ),
    ) as {
      layers: Array<{ name: string; states: string[] }>;
    };
    const conversation = manifest.layers.find(
      (layer) => layer.name === "ConversationAct",
    );
    const safety = manifest.layers.find((layer) => layer.name === "SafetyBase");
    const governedActs = [
      ...(conversation?.states ?? []),
      ...(safety?.states.filter((state) => state !== "clear") ?? []),
    ];

    assert.deepEqual([...LIVING_MENTOR_ACTS], governedActs);
  });

  it("fails safe when risk caution overlaps every conversational state", () => {
    assert.equal(
      selectLivingMentorAct({
        riskCaution: true,
        isSpeaking: true,
        isThinking: true,
        isComposing: true,
      }),
      "risk_caution",
    );
  });

  it("shows explanation when streaming begins before request settlement", () => {
    assert.equal(
      selectLivingMentorAct({
        riskCaution: false,
        isSpeaking: true,
        isThinking: true,
        isComposing: false,
      }),
      "explain",
    );
  });

  it("maps loading, composing and calm host states deterministically", () => {
    assert.equal(
      selectLivingMentorAct({
        riskCaution: false,
        isSpeaking: false,
        isThinking: true,
        isComposing: true,
      }),
      "think",
    );
    assert.equal(
      selectLivingMentorAct({
        riskCaution: false,
        isSpeaking: false,
        isThinking: false,
        isComposing: true,
      }),
      "listen",
    );
    assert.equal(
      selectLivingMentorAct({
        riskCaution: false,
        isSpeaking: false,
        isThinking: false,
        isComposing: false,
      }),
      "idle_attentive",
    );
  });
});
