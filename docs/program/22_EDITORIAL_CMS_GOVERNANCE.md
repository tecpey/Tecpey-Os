# Editorial CMS & Content Governance

**Base:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** complements #710 Organic Growth OS and #709 News/Market Intelligence. It owns editorial authority, not search ranking logic.

## Objective
Provide a governed content-management layer for Academy/public editorial pages, FAQs, glossary, campaigns and evergreen education so publishing does not require code changes or uncontrolled AI auto-publication.

## Content model
- canonical content ID independent of slug/locale;
- locale variants with translation status and source locale;
- draft → review → scheduled → published → superseded/retired lifecycle;
- author/editor/reviewer/publisher roles;
- version history and immutable publication revisions;
- title/summary/body/SEO metadata/schema inputs/internal links/freshness class/source references;
- media asset authority, alt text, ownership/license metadata and safe transformations.

## Workflow
- preview environment with no accidental indexing;
- approval requirements vary by risk class;
- current financial/market claims require sources/freshness and stronger review;
- scheduled publication uses server time and explicit timezone;
- corrections create visible revision lineage;
- rollback restores a prior revision without deleting audit history.

## AI assistance
AI may research/draft/translate/summarize but cannot directly publish high-risk content. Prompt/source injection defenses, provenance and human approval are required. FA writing must be native-quality rather than literal machine translation.

## Localization/search integrity
- canonical/hreflang/schema derived from published visible content;
- no hidden crawler/LLM-only claims;
- slug redirects preserved on rename;
- draft/retired content excluded from active sitemaps;
- content parity/status visible for FA/EN.

## Security
bounded rich-text/HTML sanitization; attachment MIME/size scanning; permission checks on every content/media object; tenant scope if enterprise CMS is later enabled; audit every publish/unpublish/role change.

## Acceptance
A non-developer can create, review, schedule, publish, correct and retire bilingual content with full provenance and no code deploy, while Growth OS consumes only approved canonical content.
