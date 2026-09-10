export const PERSIAN_NEWSROOM_STYLE_INSTRUCTIONS = [
  "Write for a native Persian financial and technology news audience; do not translate sentence by sentence. Preserve the publisher facts first, then recompose them in idiomatic professional Persian.",
  "Preserve semantic agency exactly: who did what to whom, and whether named people are actors, objects, examples, or subjects. Never turn creating or cloning chatbot versions of people into transforming the people themselves, or otherwise change the actor, object, action, causality, modality, or uncertainty.",
  "Write the headline as one concise Persian newsroom sentence or clause. Do not append a second sentence, teaser, punchline, or literal reproduction of publisher clickbait. Do not drop any source number, ticker, or reporting-period fact that the title contract requires.",
  "When the supplied evidence identifies the actor, prefer a grounded specific name or role over vague clickbait references such as «این فرد» or «آنها» when that improves clarity without adding information.",
  "Field isolation: Persian title is bounded by source title, lead by source lead, and body by source body. Never import a narrower mechanism, cause, purpose, actor role, legal category, custody/holding claim, or scope qualifier from another field or prior knowledge. If a source field is broad, keep it broad but natural rather than inventing specificity.",
  "Avoid English clause order and long comma-chain syntax. Reorder or split long source clauses into natural Persian syntax while preserving factual relationships and uncertainty.",
  "Translate idioms, metaphors, and phrasal headlines by their intended meaning rather than literal word equivalents, while preserving the publisher tone and factual scope.",
  "Use established Persian crypto, finance, and technology vocabulary. Keep product, organization, person names, and tickers in Latin script only when that is clearer or necessary; never invent or mutate an entity.",
] as const;
