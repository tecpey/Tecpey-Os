import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import {
  INITIAL_LIVING_MENTOR_RIVE_ADAPTER_STATE,
  LIVING_MENTOR_RIVE_BINDING_PATHS,
  LIVING_MENTOR_RIVE_VALUE_PATHS,
  projectLivingMentorRiveFrame,
} from "@/lib/living-mentor-rive-adapter";

type MutableTestSnapshot = {
  contractVersion: string;
  viewModel: {
    mentor: Record<string, unknown>;
    speech: Record<string, unknown>;
    world: Record<string, unknown>;
  };
};

async function validSnapshot() {
  return JSON.parse(
    await readFile(
      path.join(
        process.cwd(),
        "docs/mentor/examples/tecpey-mentor-rive-viewmodel.v1.example.json",
      ),
      "utf8",
    ),
  ) as MutableTestSnapshot;
}

const beforeExampleExpiry = Date.parse("2026-08-30T09:31:00Z");

describe("Living Mentor Rive runtime adapter", () => {
  it("stays byte-for-byte aligned with the manifest binding allowlist", async () => {
    const manifest = JSON.parse(
      await readFile(
        path.join(
          process.cwd(),
          "docs/mentor/rig/tecpey-mentor-rig-manifest.v1.json",
        ),
        "utf8",
      ),
    ) as { bindings: Array<{ path: string }> };

    assert.deepEqual(
      [...LIVING_MENTOR_RIVE_BINDING_PATHS],
      manifest.bindings.map((binding) => binding.path),
    );
  });

  it("projects only visual allowlisted values and never host-only personal data", async () => {
    const snapshot = await validSnapshot();
    const frame = projectLivingMentorRiveFrame(snapshot, undefined, {
      nowMs: beforeExampleExpiry,
    });

    assert.deepEqual(Object.keys(frame.bindings), LIVING_MENTOR_RIVE_VALUE_PATHS);
    assert.equal(JSON.stringify(frame.bindings).includes("مانا"), false);
    assert.equal(JSON.stringify(frame.bindings).includes("risk.position_sizing"), false);
    assert.equal(frame.bindings["mentor.act"], "risk_caution");
    assert.equal(frame.triggerPlayAct, true);
  });

  it("fires a governed act once per eventId", async () => {
    const snapshot = await validSnapshot();
    const first = projectLivingMentorRiveFrame(snapshot, undefined, {
      nowMs: beforeExampleExpiry,
    });
    const replay = projectLivingMentorRiveFrame(snapshot, first.nextState, {
      nowMs: beforeExampleExpiry,
    });

    assert.equal(first.triggerPlayAct, true);
    assert.equal(replay.triggerPlayAct, false);
  });

  it("forces an expired snapshot to a static unavailable state", async () => {
    const snapshot = await validSnapshot();
    const frame = projectLivingMentorRiveFrame(snapshot, undefined, {
      nowMs: Date.parse("2026-08-30T09:36:00Z"),
    });

    assert.equal(frame.fallbackReason, "snapshot_expired");
    assert.equal(frame.bindings["mentor.act"], "data_unavailable");
    assert.equal(frame.bindings["mentor.intensity"], 0);
    assert.equal(frame.bindings["speech.viseme"], "sil");
    assert.equal(frame.bindings["accessibility.reducedMotion"], true);
    assert.equal(frame.triggerPlayAct, false);
  });

  it("fails closed on an unsupported contract major", async () => {
    const snapshot = await validSnapshot();
    snapshot.contractVersion = "2.0.0";
    const frame = projectLivingMentorRiveFrame(snapshot, undefined, {
      nowMs: beforeExampleExpiry,
    });

    assert.equal(frame.fallbackReason, "contract_mismatch");
    assert.equal(frame.bindings["mentor.act"], "error_recover");
    assert.equal(frame.triggerPlayAct, false);
  });

  it("clamps deformers and strips articulation while audio is not speaking", async () => {
    const snapshot = await validSnapshot();
    snapshot.viewModel.mentor.intensity = 4;
    snapshot.viewModel.mentor.priority = -20;
    snapshot.viewModel.speech.state = "idle";
    snapshot.viewModel.speech.viseme = "vowel_open";
    snapshot.viewModel.speech.jawOpen = 4;
    snapshot.viewModel.world.roomState = "stale";
    snapshot.viewModel.world.roomLevel = 5;

    const frame = projectLivingMentorRiveFrame(snapshot, undefined, {
      nowMs: beforeExampleExpiry,
    });

    assert.equal(frame.bindings["mentor.intensity"], 1);
    assert.equal(frame.bindings["mentor.priority"], 0);
    assert.equal(frame.bindings["speech.viseme"], "sil");
    assert.equal(frame.bindings["speech.jawOpen"], 0);
    assert.equal(frame.bindings["world.roomLevel"], 0);
  });

  it("applies device reduced motion without disabling essential lip sync", async () => {
    const snapshot = await validSnapshot();
    snapshot.viewModel.mentor.intensity = 0.8;
    snapshot.viewModel.world.celebrationTier = "milestone";
    snapshot.viewModel.speech.state = "speaking";
    snapshot.viewModel.speech.utteranceId = "utterance_001";
    snapshot.viewModel.speech.viseme = "bilabial";
    snapshot.viewModel.speech.lipPress = 0.65;

    const frame = projectLivingMentorRiveFrame(snapshot, undefined, {
      deviceReducedMotion: true,
      nowMs: beforeExampleExpiry,
    });

    assert.equal(frame.bindings["mentor.intensity"], 0);
    assert.equal(frame.bindings["world.celebrationTier"], "none");
    assert.equal(frame.bindings["speech.viseme"], "bilabial");
    assert.equal(frame.bindings["speech.lipPress"], 0.65);
  });

  it("rejects late speech frames until the next utterance is queued", async () => {
    const snapshot = await validSnapshot();
    snapshot.viewModel.speech.state = "queued";
    snapshot.viewModel.speech.utteranceId = "utterance_001";
    const queued = projectLivingMentorRiveFrame(snapshot, undefined, {
      nowMs: beforeExampleExpiry,
    });

    snapshot.viewModel.speech.state = "speaking";
    snapshot.viewModel.speech.viseme = "vowel_open";
    snapshot.viewModel.speech.jawOpen = 0.7;
    const speaking = projectLivingMentorRiveFrame(snapshot, queued.nextState, {
      nowMs: beforeExampleExpiry,
    });

    snapshot.viewModel.speech.utteranceId = "utterance_late";
    snapshot.viewModel.speech.viseme = "bilabial";
    const stale = projectLivingMentorRiveFrame(snapshot, speaking.nextState, {
      nowMs: beforeExampleExpiry,
    });

    assert.equal(stale.droppedStaleSpeechFrame, true);
    assert.equal(stale.bindings["speech.viseme"], "vowel_open");
    assert.equal(stale.bindings["speech.jawOpen"], 0.7);

    snapshot.viewModel.speech.state = "ended";
    snapshot.viewModel.speech.utteranceId = "utterance_001";
    const ended = projectLivingMentorRiveFrame(snapshot, stale.nextState, {
      nowMs: beforeExampleExpiry,
    });
    assert.equal(ended.droppedStaleSpeechFrame, false);
    assert.equal(ended.nextState.activeUtteranceId, null);

    snapshot.viewModel.speech.state = "queued";
    snapshot.viewModel.speech.utteranceId = "utterance_late";
    const nextQueued = projectLivingMentorRiveFrame(snapshot, ended.nextState, {
      nowMs: beforeExampleExpiry,
    });
    snapshot.viewModel.speech.state = "speaking";
    const nextSpeaking = projectLivingMentorRiveFrame(
      snapshot,
      nextQueued.nextState,
      { nowMs: beforeExampleExpiry },
    );

    assert.equal(nextSpeaking.droppedStaleSpeechFrame, false);
    assert.equal(nextSpeaking.bindings["speech.viseme"], "bilabial");
  });

  it("never reactivates a retired utterance from delayed queued or speaking frames", async () => {
    const snapshot = await validSnapshot();
    snapshot.viewModel.speech.state = "queued";
    snapshot.viewModel.speech.utteranceId = "utterance_done";
    const queued = projectLivingMentorRiveFrame(snapshot, undefined, {
      nowMs: beforeExampleExpiry,
    });

    snapshot.viewModel.speech.state = "speaking";
    snapshot.viewModel.speech.viseme = "vowel_open";
    const speaking = projectLivingMentorRiveFrame(snapshot, queued.nextState, {
      nowMs: beforeExampleExpiry,
    });

    snapshot.viewModel.speech.state = "ended";
    const ended = projectLivingMentorRiveFrame(snapshot, speaking.nextState, {
      nowMs: beforeExampleExpiry,
    });
    assert.deepEqual(ended.nextState.retiredUtteranceIds, ["utterance_done"]);
    assert.equal(ended.bindings["speech.viseme"], "sil");

    for (const delayedState of ["speaking", "queued"] as const) {
      snapshot.viewModel.speech.state = delayedState;
      snapshot.viewModel.speech.viseme = "bilabial";
      const delayed = projectLivingMentorRiveFrame(snapshot, ended.nextState, {
        nowMs: beforeExampleExpiry,
      });
      assert.equal(delayed.droppedStaleSpeechFrame, true);
      assert.equal(delayed.bindings["speech.viseme"], "sil");
      assert.equal(delayed.nextState.activeUtteranceId, null);
    }

    snapshot.viewModel.speech.state = "queued";
    snapshot.viewModel.speech.utteranceId = "utterance_next";
    const next = projectLivingMentorRiveFrame(snapshot, ended.nextState, {
      nowMs: beforeExampleExpiry,
    });
    assert.equal(next.droppedStaleSpeechFrame, false);
    assert.equal(next.nextState.activeUtteranceId, "utterance_next");
  });

  it("keeps the exported initial reducer state immutable and safe", () => {
    assert.equal(INITIAL_LIVING_MENTOR_RIVE_ADAPTER_STATE.lastEventId, null);
    assert.deepEqual(INITIAL_LIVING_MENTOR_RIVE_ADAPTER_STATE.retiredUtteranceIds, []);
    assert.equal(
      INITIAL_LIVING_MENTOR_RIVE_ADAPTER_STATE.acceptedSpeech["speech.viseme"],
      "sil",
    );
  });
});
