export type CaptureContinuity =
  | "bootstrap"
  | "bootstrap_empty"
  | "proven_overlap"
  | "continuity_unproven"
  | "empty_feed"
  | "source_failed";

export type NewsSourceContinuityMode = "required" | "quarantined";

export function captureContinuity(input: {
  sourceFailed: boolean;
  previousHeadExists: boolean;
  fetchedCount: number;
  replayedCount: number;
}): CaptureContinuity {
  if (input.sourceFailed) return "source_failed";
  if (!input.previousHeadExists) {
    return input.fetchedCount === 0 ? "bootstrap_empty" : "bootstrap";
  }
  if (input.fetchedCount === 0) return "empty_feed";
  if (input.replayedCount > 0) return "proven_overlap";
  return "continuity_unproven";
}

export function isContinuityRisk(continuity: CaptureContinuity): boolean {
  return continuity === "bootstrap_empty"
    || continuity === "continuity_unproven"
    || continuity === "empty_feed"
    || continuity === "source_failed";
}

export function participatesInContinuity(mode: NewsSourceContinuityMode | undefined): boolean {
  return (mode ?? "required") === "required";
}
