# TecPey News No-Loss + Governed Media Architecture — 2026-09-13

## Objective

TecPey must not convert an AI/provider outage, translation-quality rejection, entity-resolution gap, or media-rights uncertainty into a lost news item.

The operating model deliberately separates five authorities:

1. **Capture authority** — preserve every valid item observed from a governed source.
2. **Archive presentation authority** — make captured evidence discoverable by day even while enrichment is pending.
3. **Enrichment authority** — produce Persian editorial rendering under factual, numeric, entity, cost and quality controls.
4. **Publication authority** — decide whether a localized item may receive a TecPey detail URL, ranking influence and other public-product privileges.
5. **Indexing authority** — IndexNow/search submission remains downstream of final governed publication and Organic Growth readiness.

Archive visibility is therefore intentionally broader than publication authority.

## No-loss invariant

A captured immutable source record is never hidden merely because Persian translation is pending or failed.

For the Persian daily archive:

- completed governed translation => Persian title/lead/body;
- pending or failed translation => publisher title/lead/body with an explicit `translationPending` UI state;
- pending rows do **not** feed the Persian landing news list, Academy news quiz, automation preview, ranking, sitemap or IndexNow;
- after a completed translation is persisted, the same archive surface automatically presents the governed Persian rendering.

This makes provider incidents visible as enrichment backlog instead of silent content loss.

## Translation reliability policy

Failure classes are intentionally different:

- network/timeout/rate-limit/circuit failures: bounded retry after short cooldown;
- deterministic model-output variability such as numeric-integrity, unsupported-entity, field-shape and editorial-quality failures: bounded retry because a new generation can repair the output while the validator remains strict;
- credential/provider availability failures such as rejected key, disabled provider or exhausted quota: recoverable configuration with slower exponential/capped backoff because credentials and account state can change without publisher evidence changing;
- response-size and unknown failures: fail closed until explicitly understood.

The safety validators remain intact. Retry policy is relaxed; factual acceptance policy is not.

## Numeric integrity

Persian newsroom instructions now require a pre-generation numeric inventory and field-by-field self-check. If a title contains `2%`, `$100 million`, `Q3`, `2026`, or another numeric fact, the same fact must remain in the corresponding Persian field with sign, percentage, currency and magnitude preserved.

The deterministic validator remains the final authority.

## Media model

Source imagery is optional and rights-aware. The UI never requires an external image in order to render a complete news card.

Media resolution order:

1. RSS/Atom `media:content`;
2. RSS/Atom `media:thumbnail`;
3. image enclosure;
4. embedded feed image;
5. publisher `og:image` / Twitter card only when full publisher-page fetch is allowed by source policy;
6. TecPey visual fallback when no governed source media is available.

Security boundaries:

- requested article must already exist in TecPey's immutable archive;
- publisher page fetch remains constrained to registry-approved hosts and manually validated redirects;
- media URL must be HTTPS;
- local/private literal network targets are rejected;
- response bodies are bounded and time-limited;
- user referrer is suppressed;
- provider readiness must explicitly allow `licensed` or `official_attribution` media;
- blocked, quarantined, unknown or `tecpey_generated` sources never receive a source-image request from the archive presentation model.

The media redirect is cacheable and does not proxy or duplicate publisher image bytes.

## UX contract

Daily archive cards use a responsive 16:9 media frame with `object-cover`, lazy decoding and an always-present TecPey fallback. Desktop uses a media/content split; mobile stacks media above text.

Every card communicates:

- publisher and publication time;
- evidence coverage (`article_full`, `feed_full`, `feed_summary`);
- translation state;
- title and lead;
- expandable archived/full translated body;
- taxonomy tags;
- governed TecPey context URL only when one exists;
- original publisher URL;
- image attribution when source media is used.

Pending Persian records explicitly explain that the source record is preserved but is not yet eligible for Persian auto-publication/ranking.

## Entity gap closed

The staging EURR/Revolut/Bridge story exposed a real deterministic entity gap. The entity resolver now includes:

- Revolut;
- EURR;
- Bridge Building / issuer-specific Bridge phrases.

The generic word `bridge` alone is not treated as a concrete entity to avoid false positives.

## Acceptance gates

Before enabling staging timers:

- capture worker proves required-source continuity;
- current OpenAI credential probe succeeds;
- enrichment canary shows provider rejection regression removed;
- Persian archive count equals captured archive count for the selected day even when some translations are pending;
- pending Persian rows are absent from quiz/automation downstream authority;
- completed Persian rows render governed full body;
- representative allowed source thumbnail renders or falls back safely;
- blocked/unready source thumbnail returns safe fallback;
- IndexNow remains `submitted: 0` until explicit governed publication attestation is wired;
- all exact-head CI/security/browser checks are green.

Production remains untouched until the staging evidence gate is explicitly approved.
