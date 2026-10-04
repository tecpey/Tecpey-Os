import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { NewsTaxonomyMatch } from "./news-taxonomy";

export const NEWS_STORY_CLUSTER_POLICY_VERSION = "story-cluster-v1";
const MAX_CANDIDATE_HOURS = 36;
const MIN_TITLE_JACCARD = 0.62;
const DISTINCT_VIEWPOINT_JACCARD = 0.40;

export type StoryClusterCandidate = {
  archiveId: string; sourceName: string; sourceDomain: string; articleUrl: string;
  title: string; lead: string; publishedAt: string; taxonomy: NewsTaxonomyMatch;
};
export type StoryClusterMembership = "canonical" | "corroborating" | "distinct_viewpoint" | "conflicting_viewpoint";
export type StoryClusterEvidence = {
  policyVersion: typeof NEWS_STORY_CLUSTER_POLICY_VERSION;
  candidateGeneration: { eventKeys: string[]; sharedEntities: string[]; hoursApart: number };
  titleJaccard: number; sharedEntityCount: number; sourceIndependent: boolean;
  conflictSignals: string[];
  embeddingEvidence: { provider: string | null; score: number | null; usedForDecision: false };
  decision: "merge" | "preserve_distinct";
};
export type StoryCluster = {
  clusterId: string; seedArchiveId: string; canonicalEventKey: string;
  members: Array<{ archiveId: string; membership: StoryClusterMembership; evidence: StoryClusterEvidence | null }>;
  independentSourceCount: number; conflictingViewpointCount: number; decisionEvidence: StoryClusterEvidence[];
};

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[\u200c\u200f\u202a-\u202e]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function tokens(value: string): Set<string> { return new Set(normalize(value).split(" ").filter((token) => token.length >= 3)); }
function jaccard(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]); if (!union.size) return 1;
  return [...a].filter((value) => b.has(value)).length / union.size;
}
function entityKeys(item: StoryClusterCandidate): string[] {
  return [
    ...item.taxonomy.coinSymbols.map((v) => `coin:${v.toUpperCase()}`),
    ...item.taxonomy.toolSlugs.map((v) => `tool:${v}`),
    ...item.taxonomy.topicTags.map((v) => `topic:${v}`),
  ].sort();
}
function eventKeys(item: StoryClusterCandidate): string[] {
  const day = new Date(item.publishedAt).toISOString().slice(0, 10);
  const entities = entityKeys(item);
  return entities.length ? entities.map((entity) => `${day}|${entity}`) : [`${day}|untagged`];
}
function sharedEntities(a: StoryClusterCandidate, b: StoryClusterCandidate): string[] {
  const left = new Set(entityKeys(a)); const right = new Set(entityKeys(b));
  return [...left].filter((value) => right.has(value)).sort();
}
function containsNormalizedTerm(value: string, term: string): boolean {
  const normalized = normalize(value);
  const escaped = term.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\function containsNormalizedTerm(value: string, term: string): boolean {
  const normalized = normalize(value);
  const escaped = term.replace(/[.*+?^\${}()|[\]\\]/g, "\\function conflictSignals(a: StoryClusterCandidate, b: StoryClusterCandidate): string[] {
  const left = tokens(a.title + " " + a.lead);
  const right = tokens(b.title + " " + b.lead);
  const pairs = [
    ["approve", "reject"], ["approved", "rejected"], ["accept", "deny"], ["confirm", "deny"],
    ["confirms", "denies"], ["launch", "cancel"], ["launched", "cancelled"], ["wins", "loses"],
    ["win", "lose"], ["up", "down"], ["rise", "fall"], ["rises", "falls"],
    ["increase", "decrease"], ["increases", "decreases"],
    ["تایید", "رد"], ["قبول", "رد"], ["افزایش", "کاهش"],
  ];
  const hits: string[] = [];
  for (const [affirmative, negative] of pairs) {
    if (
      (left.has(affirmative) && right.has(negative))
      || (left.has(negative) && right.has(affirmative))
    ) {
      hits.push(affirmative + "↔" + negative);
    }
  }
  return [...new Set(hits)].sort();
}");
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, "u").test(normalized);
}

function conflictSignals(a: StoryClusterCandidate, b: StoryClusterCandidate): string[] {
  const left = a.title + " " + a.lead;
  const right = b.title + " " + b.lead;
  const pairs = [
    ["approve", "reject"], ["approved", "rejected"], ["accept", "deny"], ["confirm", "deny"],
    ["confirms", "denies"], ["launch", "cancel"], ["launched", "cancelled"], ["wins", "loses"],
    ["win", "lose"], ["up", "down"], ["rise", "fall"], ["rises", "falls"],
    ["increase", "decrease"], ["increases", "decreases"],
    ["تایید", "رد"], ["قبول", "رد"], ["افزایش", "کاهش"],
  ];
  const hits: string[] = [];
  for (const [affirmative, negative] of pairs) {
    if (
      (containsNormalizedTerm(left, affirmative) && containsNormalizedTerm(right, negative))
      || (containsNormalizedTerm(left, negative) && containsNormalizedTerm(right, affirmative))
    ) {
      hits.push(affirmative + "↔" + negative);
    }
  }
  return [...new Set(hits)].sort();
}

function candidatePairKey");
  return new RegExp("(^|\\\\s)" + escaped + "(?=$|\\\\s)", "u").test(normalized);
}

function conflictSignals(a: StoryClusterCandidate, b: StoryClusterCandidate): string[] {
  const left = a.title + " " + a.lead;
  const right = b.title + " " + b.lead;
  const pairs = [
    ["approve", "reject"], ["approved", "rejected"], ["accept", "deny"], ["confirm", "deny"],
    ["confirms", "denies"], ["launch", "cancel"], ["launched", "cancelled"], ["wins", "loses"],
    ["win", "lose"], ["up", "down"], ["rise", "fall"], ["rises", "falls"],
    ["increase", "decrease"], ["increases", "decreases"],
    ["تایید", "رد"], ["قبول", "رد"], ["افزایش", "کاهش"],
  ];
  const hits: string[] = [];
  for (const [affirmative, negative] of pairs) {
    if (
      (containsNormalizedTerm(left, affirmative) && containsNormalizedTerm(right, negative))
      || (containsNormalizedTerm(left, negative) && containsNormalizedTerm(right, affirmative))
    ) {
      hits.push(affirmative + "↔" + negative);
    }
  }
  return [...new Set(hits)].sort();
}

function candidatePairKey(a: StoryClusterCandidate, b: StoryClusterCandidate): string {
  return [a.archiveId, b.archiveId].sort().join("\0");
}

function candidatePairs(items: readonly StoryClusterCandidate[]): Array<readonly [StoryClusterCandidate, StoryClusterCandidate]> {
  const byEntity = new Map<string, StoryClusterCandidate[]>();
  for (const item of items) {
    for (const entity of entityKeys(item)) {
      const bucket = byEntity.get(entity) ?? [];
      bucket.push(item);
      byEntity.set(entity, bucket);
    }
  }

  const pairs = new Map<string, readonly [StoryClusterCandidate, StoryClusterCandidate]>();
  for (const bucket of byEntity.values()) {
    const ordered = [...bucket].sort(
      (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || a.archiveId.localeCompare(b.archiveId),
    );
    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        if (hoursApart(ordered[i].publishedAt, ordered[j].publishedAt) > MAX_CANDIDATE_HOURS) break;
        const left = ordered[i];
        const right = ordered[j];
        pairs.set(candidatePairKey(left, right), [left, right]);
      }
    }
  }

  return [...pairs.values()].sort(
    (a, b) => candidatePairKey(a[0], a[1]).localeCompare(candidatePairKey(b[0], b[1])),
  );
}
function hoursApart(a: string, b: string): number { return Math.abs(Date.parse(a) - Date.parse(b)) / 3_600_000; }
function sourceIndependent(a: StoryClusterCandidate, b: StoryClusterCandidate): boolean {
  return a.sourceDomain !== b.sourceDomain && a.sourceName !== b.sourceName;
}
function clusterId(seedArchiveId: string): string {
  const d = createHash("sha256").update(`${NEWS_STORY_CLUSTER_POLICY_VERSION}\0${seedArchiveId}`).digest("hex");
  return [d.slice(0, 8), d.slice(8, 12), `4${d.slice(13, 16)}`, 
    (((parseInt(d.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") + d.slice(18, 20)), d.slice(20, 32)].join("-");
}

export function compareStoryClusterCandidate(a: StoryClusterCandidate, b: StoryClusterCandidate,
  embeddingEvidence: StoryClusterEvidence["embeddingEvidence"] = { provider: null, score: null, usedForDecision: false }): StoryClusterEvidence {
  const titleJaccard = jaccard(tokens(a.title), tokens(b.title));
  const shared = sharedEntities(a, b); const conflicts = conflictSignals(a, b);
  const closeEnough = hoursApart(a.publishedAt, b.publishedAt) <= MAX_CANDIDATE_HOURS;
  const merge = closeEnough && conflicts.length === 0 && shared.length > 0 && titleJaccard >= MIN_TITLE_JACCARD;
  const canonicalEventKey = eventKeys(a).find((key) => eventKeys(b).includes(key)) ?? eventKeys(a)[0];
  return {
    policyVersion: NEWS_STORY_CLUSTER_POLICY_VERSION,
    candidateGeneration: { eventKeys: [canonicalEventKey], sharedEntities: shared, hoursApart: hoursApart(a.publishedAt, b.publishedAt) },
    titleJaccard, sharedEntityCount: shared.length, sourceIndependent: sourceIndependent(a, b), conflictSignals: conflicts,
    embeddingEvidence: { ...embeddingEvidence, usedForDecision: false }, decision: merge ? "merge" : "preserve_distinct",
  };
}

export type StoryRelation = {
  leftArchiveId: string;
  rightArchiveId: string;
  relation: "conflicting_viewpoint" | "distinct_viewpoint";
  evidence: StoryClusterEvidence;
};

export function buildStoryRelations(items: readonly StoryClusterCandidate[]): StoryRelation[] {
  const relations: StoryRelation[] = [];
  for (const [left, right] of candidatePairs(items)) {
    const evidence = compareStoryClusterCandidate(left, right);
    const conflict = evidence.conflictSignals.length > 0;
    const viewpoint = evidence.titleJaccard >= DISTINCT_VIEWPOINT_JACCARD
      && evidence.decision === "preserve_distinct";
    if (conflict || viewpoint) {
      relations.push({
        leftArchiveId: left.archiveId,
        rightArchiveId: right.archiveId,
        relation: conflict ? "conflicting_viewpoint" : "distinct_viewpoint",
        evidence,
      });
    }
  }
  return relations;
}

export function buildDeterministicStoryClusters(items: readonly StoryClusterCandidate[]): StoryCluster[] {
  const ordered = [...items].sort(
    (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || a.archiveId.localeCompare(b.archiveId),
  );
  const byId = new Map(ordered.map((item) => [item.archiveId, item]));
  const candidateIds = new Map<string, Set<string>>();
  for (const [left, right] of candidatePairs(ordered)) {
    const leftSet = candidateIds.get(left.archiveId) ?? new Set<string>();
    leftSet.add(right.archiveId);
    candidateIds.set(left.archiveId, leftSet);
    const rightSet = candidateIds.get(right.archiveId) ?? new Set<string>();
    rightSet.add(left.archiveId);
    candidateIds.set(right.archiveId, rightSet);
  }

  const clusters: StoryCluster[] = [];
  for (const item of ordered) {
    const options: Array<{ cluster: StoryCluster; evidence: StoryClusterEvidence }> = [];
    const candidates = candidateIds.get(item.archiveId) ?? new Set<string>();

    for (const cluster of clusters) {
      const seed = byId.get(cluster.seedArchiveId);
      if (!seed || !candidates.has(seed.archiveId)) continue;
      const evidence = compareStoryClusterCandidate(seed, item);
      if (evidence.decision === "merge") options.push({ cluster, evidence });
    }

    options.sort((a, b) =>
      b.evidence.titleJaccard - a.evidence.titleJaccard
      || b.evidence.sharedEntityCount - a.evidence.sharedEntityCount
      || Number(b.evidence.sourceIndependent) - Number(a.evidence.sourceIndependent)
      || a.cluster.clusterId.localeCompare(b.cluster.clusterId),
    );

    const selected = options[0];
    if (!selected) {
      clusters.push({
        clusterId: clusterId(item.archiveId),
        seedArchiveId: item.archiveId,
        canonicalEventKey: eventKeys(item)[0],
        members: [{ archiveId: item.archiveId, membership: "canonical", evidence: null }],
        independentSourceCount: 1,
        conflictingViewpointCount: 0,
        decisionEvidence: [],
      });
      continue;
    }

    selected.cluster.members.push({
      archiveId: item.archiveId,
      membership: "corroborating",
      evidence: selected.evidence,
    });
    selected.cluster.decisionEvidence.push(selected.evidence);
    selected.cluster.independentSourceCount = new Set(
      selected.cluster.members
        .map((member) => byId.get(member.archiveId)?.sourceDomain)
        .filter(Boolean),
    ).size;
  }
  return clusters;
}

export async function materializeStoryClustersTx(client: PoolClient, now: string, lookbackHours = 48): Promise<{ clusterCount: number; memberCount: number }> {
  const since = new Date(Date.parse(now) - lookbackHours * 3_600_000).toISOString();
  type NewsStoryArchiveRow = {
    archive_id: string;
    source_name: string;
    source_domain: string;
    article_url: string;
    source_title: string;
    source_lead: string;
    published_at: string | Date;
    taxonomy: NewsTaxonomyMatch;
  };
  const rows = await client.query<NewsStoryArchiveRow>(
    `SELECT archive_id::text, source_name, source_domain, article_url, source_title,
            source_lead, published_at, taxonomy
       FROM platform_news_archive_items WHERE published_at >= $1::timestamptz
       ORDER BY published_at ASC, archive_id ASC`, [since]);
  const items = rows.rows.map((row) => ({ archiveId: row.archive_id, sourceName: row.source_name, sourceDomain: row.source_domain,
    articleUrl: row.article_url, title: row.source_title, lead: row.source_lead, publishedAt: new Date(row.published_at).toISOString(), taxonomy: row.taxonomy }));
  const clusters = buildDeterministicStoryClusters(items);
  const relations = buildStoryRelations(items);
  const existing = await client.query<{ archive_id: string; cluster_id: string; membership: StoryClusterMembership }>(
    `SELECT archive_id::text, cluster_id::text, membership
       FROM platform_news_story_cluster_members
      WHERE archive_id = ANY($1::uuid[])`,
    [items.map((i) => i.archiveId)],
  );
  const existingByArchive = new Map(existing.rows.map((row) => [row.archive_id, row]));
  for (const relation of relations) {
    const evidence = {
      ...relation.evidence,
      relation: relation.relation,
      leftArchiveId: relation.leftArchiveId,
      rightArchiveId: relation.rightArchiveId,
    };
    const decisionHash = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
    const relationDigest = createHash("sha256")
      .update(`${NEWS_STORY_CLUSTER_POLICY_VERSION}\0${relation.leftArchiveId}\0${relation.rightArchiveId}\0${relation.relation}`)
      .digest("hex");
    const relationId = [
      relationDigest.slice(0, 8),
      relationDigest.slice(8, 12),
      `4${relationDigest.slice(13, 16)}`,
      `${((parseInt(relationDigest.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${relationDigest.slice(18, 20)}`,
      relationDigest.slice(20, 32),
    ].join("-");
    await client.query(`INSERT INTO platform_news_story_relations
      (relation_id,left_archive_id,right_archive_id,relation,evidence,policy_version,decision_hash,created_at)
      VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb,$6,$7,$8::timestamptz)
      ON CONFLICT (left_archive_id,right_archive_id,relation) DO NOTHING`,
      [relationId, relation.leftArchiveId, relation.rightArchiveId, relation.relation,
        JSON.stringify(evidence), NEWS_STORY_CLUSTER_POLICY_VERSION, decisionHash, now]);
  }

  for (const cluster of clusters) {
    const evidence = { policyVersion: NEWS_STORY_CLUSTER_POLICY_VERSION, generatedAt: now, canonicalEventKey: cluster.canonicalEventKey,
      memberCount: cluster.members.length, independentSourceCount: cluster.independentSourceCount,
      conflictingViewpointCount: cluster.conflictingViewpointCount, decisions: cluster.decisionEvidence,
      optionalEmbeddingEvidence: "not-used-for-decision" };
    const decisionHash = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
    await client.query(`INSERT INTO platform_news_story_clusters
      (cluster_id, policy_version, seed_archive_id, canonical_event_key, member_count, independent_source_count,
       conflicting_viewpoint_count, decision_evidence, decision_hash, generated_at, updated_at)
      VALUES ($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8::jsonb,$9,$10::timestamptz,NOW())
      ON CONFLICT (cluster_id) DO UPDATE SET member_count=EXCLUDED.member_count, independent_source_count=EXCLUDED.independent_source_count,
      conflicting_viewpoint_count=EXCLUDED.conflicting_viewpoint_count, decision_evidence=EXCLUDED.decision_evidence,
      decision_hash=EXCLUDED.decision_hash, generated_at=EXCLUDED.generated_at, updated_at=NOW()`,
      [cluster.clusterId, NEWS_STORY_CLUSTER_POLICY_VERSION, cluster.seedArchiveId, cluster.canonicalEventKey, cluster.members.length,
        cluster.independentSourceCount, cluster.conflictingViewpointCount, JSON.stringify(evidence), decisionHash, now]);
    for (const member of cluster.members) {
      const prior = existingByArchive.get(member.archiveId);
      if (prior && (prior.cluster_id !== cluster.clusterId || prior.membership !== member.membership)) {
        throw new Error(`news_story_cluster_reassignment_required:${member.archiveId}`);
      }
      if (prior) continue;
      await client.query(`INSERT INTO platform_news_story_cluster_members
        (cluster_id,archive_id,membership,evidence,assigned_at) VALUES ($1::uuid,$2::uuid,$3,$4::jsonb,$5::timestamptz)`,
        [cluster.clusterId, member.archiveId, member.membership, JSON.stringify(member.evidence ?? { policyVersion: NEWS_STORY_CLUSTER_POLICY_VERSION, decision: "canonical" }), now]);
    }
  }
  return { clusterCount: clusters.length, memberCount: items.length };
}
