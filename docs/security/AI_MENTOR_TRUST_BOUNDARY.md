# TecPey AI Mentor Trust and Egress Boundary

**Policy version:** `2026-07-20.2`  
**Tracked blocker:** #105  
**Canonical API:** `POST /api/ai-mentor`

## Security posture

Mentor AI is an educational safety coach. It is not a custody assistant, credential recovery service, trading signal provider, or authority for account changes.

The trust boundary must fail closed before any external model call. User-authored text, imported conversation history, Academy content, behavioral summaries, memories, model output, and provider errors are separate data classes and never share instruction authority.

## Secrets that must never leave TecPey

The external provider must never receive or echo:

- seed phrases or mnemonic/recovery phrases;
- private or secret keys, WIF values, raw secret arrays, or credential JSON;
- passwords or passphrases;
- OTP and 2FA codes;
- API keys, bearer/access tokens, JWTs, or session tokens;
- encoded forms of the above, including Unicode-obfuscated and Base64/JSON values.

When a likely secret is detected:

1. provider egress is blocked;
2. the raw message is not persisted to Mentor memory;
3. only a hash, category count, policy version, and secret-free evidence are recorded;
4. the user receives incident-safe rotation/revocation guidance without the secret being repeated.

## Data classification and minimization

Egress data classes are:

- `public`;
- `personal`;
- `financial_sensitive`;
- `authentication_secret`;
- `prohibited`.

Email addresses, phone numbers, and wallet addresses are redacted from provider input. The provider receives bounded structured Academy context and verified server context only. Client-supplied `history`, `progress`, or behavioral context fields are ignored.

Behavioral personalization is default-off and may be enabled only through the server-backed Mentor preference authority. Real-exchange behavioral signals remain disabled during this containment phase.

## Prompt integrity

Provider instructions are static server policy. User questions and prior conversation turns are serialized as typed untrusted data. Stored turns containing prompt-injection markers or secret canaries are excluded from egress context.

The provider is explicitly forbidden from treating quoted curriculum, memories, conversation turns, or behavioral data as system or tool instructions.

## Provider execution controls

- one hard wall-clock deadline per request;
- forwarding of client/request cancellation;
- at most one fallback-model attempt inside the same deadline;
- bounded response size and output token cap;
- process-local circuit breaker after repeated failures;
- no raw provider response or error is returned to users;
- immutable egress admission evidence must exist before an external provider call.

If evidence persistence is unavailable, Mentor fails closed to local Academy guidance and does not call the external provider.

## Output safety

Model output is rejected before display when it contains:

- guaranteed or risk-free returns;
- direct buy/sell-now signals;
- exact high-leverage instructions;
- certainty about future prices;
- requests for credentials or custody secrets;
- fabricated current-source claims.

Rejected output is replaced with local Academy guidance.

## Durable memory truthfulness

User and assistant turns are written in one PostgreSQL transaction under the same request ID. If the pair cannot be committed atomically, the response explicitly reports ephemeral/non-durable memory mode. No response may claim cross-device Mentor continuity unless persistence succeeded.

AI request evidence is append-only and contains no prompt, message, answer, credential, token, authorization header, cookie, or secret-bearing payload.

## Exact-head CI discipline

A task is not complete when code has merely been pushed. Before another repair commit is created, the exact current PR head must be checked once, failures must be grouped by root cause, and all related defects must be corrected in one bounded patch.

Temporary workflows that edit source code, generate commits, synchronize branches, or repeatedly retry failed checks are recovery-only assets. They must never be merged into `main`, and they must remove themselves in the same successful recovery commit.

For this boundary, the required sequence is:

1. run TypeScript and lint locally on the exact branch head;
2. run the focused Mentor provider and trust-boundary tests;
3. regenerate and verify the API security manifest whenever an API route changes;
4. push one reviewed commit;
5. wait for the resulting checks before issuing another patch;
6. never treat several red workflows caused by one compiler/test failure as several independent defects.

## Verification

Permanent release gates:

```bash
npm run check
node scripts/check-ai-mentor-trust-boundary.mjs
node --import tsx --test \
  src/tests/security/ai-mentor-provider.test.ts \
  src/tests/security/ai-mentor-trust-boundary.test.ts
npm run api:security:check
npm run test:api-security-manifest
```

Red-team coverage includes secret canaries, Unicode and Base64 obfuscation, client-history poisoning, stored prompt injection, provider timeouts, circuit breaking, oversized responses, output-signal rejection, cross-student consent isolation, atomic conversation rollback, and append-only evidence.
