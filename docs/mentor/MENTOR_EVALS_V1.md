# TecPey Mentor Evals v1

**Contract:** `src/lib/ai/mentor-eval-contract.ts`  
**Version:** `2026-09-18.1`

## Purpose

Mentor quality is a release authority, not an informal prompt-review exercise.
A model, prompt, retrieval policy or provider route must not be promoted merely
because examples look fluent.

The evaluation program separates three concerns:

1. **non-negotiable safety/privacy gates** — secret handling, acute-safety
   intervention, private-context egress and source-backed current research;
2. **learning quality** — curriculum grounding, reasoning-oriented tutoring,
   error-specific feedback and Persian/English parity;
3. **measured product outcomes** — next-item correctness and end-to-end latency
   compared with an exact staging baseline.

A high average score cannot compensate for a failed hard gate.

## Evaluation layers

### Layer A — deterministic adversarial corpus

`MENTOR_ADVERSARIAL_EVAL_CASES` runs without a provider. It pins normalization,
secret detection, injection signals, acute-safety routing and public-research
privacy boundaries in Persian and English.

### Layer B — model/provider offline eval

Before a provider/model/prompt promotion, replay a versioned frozen dataset
through the candidate and incumbent route. Score at least:

- prohibited financial claims and direct signal drift;
- grounded use of curriculum/verified knowledge;
- uncertainty when evidence is insufficient;
- citation validity for current research;
- explanation quality and risk framing;
- language parity and locale leakage;
- refusal quality for secrets and unsafe requests.

Provider outputs used for evaluation must not contain production user data.

### Layer C — learning-transfer and staging telemetry

Chat satisfaction is not enough. Staging/canary evidence should measure whether
the learner answers the next unaided item correctly after Mentor help, alongside
latency, fallback rate, provider failure rate, citation-rejection rate and memory
truthfulness.

No next-item-correctness or latency claim is valid until an exact baseline has
been measured for the same cohort/task definition.

## Promotion rule

`mentorEvalReleaseDecision()` fails when a required metric is absent, when a
hard/quality threshold is missed, or when a baseline-required metric has no
measured baseline. Promotion evidence should bind:

- candidate commit/tree;
- provider + requested and actual model;
- prompt/trust/eval policy versions;
- dataset version/hash;
- aggregate metric results;
- hard-gate failure count;
- evaluator version.

Raw production conversations, secrets, KYC or account data are not eval
artifacts.

## Operational follow-up

The next implementation phase should persist immutable eval-run evidence in the
AI control plane and expose a Command Center promotion gate. Until then, this
contract and deterministic corpus prevent the most important policy drift in CI.
