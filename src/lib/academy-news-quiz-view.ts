// View-model coercion for the news-quiz UI.
//
// The academy news-quiz board fetches /api/crypto-news?quiz=1 at runtime and
// renders each returned question interactively. The payload is validated on the
// server (every question clears the integrity authority before it is sent), but
// the board treats it as untrusted anyway and re-checks answerability here so a
// malformed or tampered entry degrades to "skipped" rather than rendering a
// question a learner cannot answer. This is a pure module (no React, no I/O) so
// the safety-critical coercion is unit-testable in isolation.

/** One entry as delivered by the `?quiz=1` payload. Untrusted: all fields loose. */
export type RawNewsQuizQuestion = {
  id?: unknown;
  question?: unknown;
  options?: unknown;
  correctAnswer?: unknown;
  explanation?: unknown;
  difficulty?: unknown;
  conceptTag?: unknown;
  source?: unknown;
  learningObjective?: unknown;
  optionRationales?: unknown;
  mentorTakeaway?: unknown;
  checklist?: unknown;
  lessonHref?: unknown;
  provenanceStatus?: unknown;
};

export type SafeNewsQuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  source: {
    name: string;
    url: string;
    publishedAt: string;
  };
  learningObjective: string;
  optionRationales: Record<string, string>;
  mentorTakeaway: string;
  checklist: string[];
  lessonHref: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Coerce one untrusted payload entry into a renderable single-choice question,
 * or return null if it cannot be scored: missing prompt, fewer than two
 * options, or a correctAnswer that is not exactly one of the options. That last
 * check is the same raw-membership rule the client grader and the server-side
 * integrity authority enforce, so the UI never presents an unanswerable item.
 */
export function toSafeNewsQuizQuestion(raw: RawNewsQuizQuestion): SafeNewsQuizQuestion | null {
  // A null / non-object entry (tampered or malformed payload) is dropped rather
  // than throwing, so a single bad item never breaks the whole board.
  if (!raw || typeof raw !== "object") return null;
  const question = asString(raw.question).trim();
  const options = Array.isArray(raw.options)
    ? raw.options.map(asString).filter((option) => option.trim().length > 0)
    : [];
  const correctAnswer = asString(raw.correctAnswer);
  const id = asString(raw.id).trim();
  const sourceRaw = raw.source && typeof raw.source === "object"
    ? (raw.source as { name?: unknown; url?: unknown; publishedAt?: unknown })
    : {};
  const source = {
    name: asString(sourceRaw.name).trim(),
    url: asString(sourceRaw.url).trim(),
    publishedAt: asString(sourceRaw.publishedAt).trim(),
  };
  const learningObjective = asString(raw.learningObjective).trim();
  const mentorTakeaway = asString(raw.mentorTakeaway).trim();
  const lessonHref = asString(raw.lessonHref).trim();
  const checklist = Array.isArray(raw.checklist)
    ? raw.checklist.map(asString).map((item) => item.trim()).filter(Boolean)
    : [];
  const rationalesRaw = raw.optionRationales && typeof raw.optionRationales === "object"
    ? (raw.optionRationales as Record<string, unknown>)
    : {};
  const optionRationales = Object.fromEntries(
    Object.entries(rationalesRaw)
      .map(([key, value]) => [key, asString(value).trim()])
      .filter(([, value]) => value.length > 0),
  );
  const completeSource = Boolean(
    source.name &&
      (source.url.startsWith("https://") || source.url.startsWith("/")) &&
      Number.isFinite(Date.parse(source.publishedAt)),
  );
  const completeRationales = options.every((option) => Boolean(optionRationales[option]));
  if (
    !question ||
    options.length < 2 ||
    !options.includes(correctAnswer) ||
    raw.provenanceStatus !== "complete" ||
    !completeSource ||
    !learningObjective ||
    !mentorTakeaway ||
    checklist.length === 0 ||
    !lessonHref ||
    !completeRationales
  ) return null;
  const difficulty =
    raw.difficulty === "easy" || raw.difficulty === "hard" ? raw.difficulty : "medium";
  return {
    id: id || question,
    question,
    options,
    correctAnswer,
    explanation: asString(raw.explanation),
    difficulty,
    source,
    learningObjective,
    optionRationales,
    mentorTakeaway,
    checklist,
    lessonHref,
  };
}

/**
 * Map a raw `?quiz=1` payload (of unknown shape) into the renderable questions,
 * dropping any entry that fails the answerability check. Ids are kept unique —
 * a later entry colliding with an already-accepted id is skipped, mirroring the
 * generator's bank-level invariant. That matters because the board keys cards by
 * id and stores grading results by id, so a duplicate id would render a
 * duplicate React key and a second answer the score could never count. A
 * non-array input yields an empty list.
 */
export function toSafeNewsQuizBank(payload: unknown): SafeNewsQuizQuestion[] {
  if (!Array.isArray(payload)) return [];
  const seen = new Set<string>();
  const safe: SafeNewsQuizQuestion[] = [];
  for (const entry of payload) {
    const question = toSafeNewsQuizQuestion(entry as RawNewsQuizQuestion);
    if (!question || seen.has(question.id)) continue;
    seen.add(question.id);
    safe.push(question);
  }
  return safe;
}
