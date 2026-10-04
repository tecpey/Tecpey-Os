import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0103_news_story_cluster_authority.sql";

export const NEWS_STORY_CLUSTER_AUTHORITY_SQL = `
CREATE TABLE IF NOT EXISTS platform_news_story_clusters (
  cluster_id UUID PRIMARY KEY,
  policy_version TEXT NOT NULL CHECK (policy_version = 'story-cluster-v1'),
  seed_archive_id UUID NOT NULL REFERENCES platform_news_archive_items(archive_id) ON DELETE RESTRICT,
  canonical_event_key TEXT NOT NULL,
  member_count INTEGER NOT NULL CHECK (member_count >= 1),
  independent_source_count INTEGER NOT NULL CHECK (independent_source_count >= 1),
  conflicting_viewpoint_count INTEGER NOT NULL CHECK (conflicting_viewpoint_count >= 0),
  decision_evidence JSONB NOT NULL,
  decision_hash CHAR(64) NOT NULL CHECK (decision_hash ~ '^[0-9a-f]{64}$'),
  generated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_news_story_cluster_members (
  cluster_id UUID NOT NULL REFERENCES platform_news_story_clusters(cluster_id) ON DELETE RESTRICT,
  archive_id UUID NOT NULL REFERENCES platform_news_archive_items(archive_id) ON DELETE RESTRICT,
  membership TEXT NOT NULL CHECK (membership IN ('canonical','corroborating','distinct_viewpoint','conflicting_viewpoint')),
  evidence JSONB NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (cluster_id, archive_id),
  UNIQUE (archive_id)
);

CREATE INDEX IF NOT EXISTS platform_news_story_clusters_event_idx
  ON platform_news_story_clusters (canonical_event_key, generated_at DESC);
CREATE INDEX IF NOT EXISTS platform_news_story_cluster_members_archive_idx
  ON platform_news_story_cluster_members (archive_id);

CREATE TABLE IF NOT EXISTS platform_news_story_relations (
  relation_id UUID PRIMARY KEY,
  left_archive_id UUID NOT NULL REFERENCES platform_news_archive_items(archive_id) ON DELETE RESTRICT,
  right_archive_id UUID NOT NULL REFERENCES platform_news_archive_items(archive_id) ON DELETE RESTRICT,
  relation TEXT NOT NULL CHECK (relation IN ('conflicting_viewpoint','distinct_viewpoint')),
  evidence JSONB NOT NULL,
  policy_version TEXT NOT NULL CHECK (policy_version = 'story-cluster-v1'),
  decision_hash CHAR(64) NOT NULL CHECK (decision_hash ~ '^[0-9a-f]{64}CREATE OR REPLACE FUNCTION tecpey_guard_news_story_cluster_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'news story cluster membership evidence cannot be deleted'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.cluster_id IS DISTINCT FROM OLD.cluster_id
     OR NEW.archive_id IS DISTINCT FROM OLD.archive_id
     OR NEW.membership IS DISTINCT FROM OLD.membership
     OR NEW.evidence IS DISTINCT FROM OLD.evidence
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at THEN
    RAISE EXCEPTION 'news story cluster membership evidence is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_news_story_cluster_membership_guard
  ON platform_news_story_cluster_members;
CREATE TRIGGER platform_news_story_cluster_membership_guard
BEFORE UPDATE OR DELETE ON platform_news_story_cluster_members
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_news_story_cluster_membership();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runNewsStoryClusterAuthorityMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(NEWS_STORY_CLUSTER_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-news-story-cluster] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(NEWS_STORY_CLUSTER_AUTHORITY_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (left_archive_id, right_archive_id, relation)
);

CREATE INDEX IF NOT EXISTS platform_news_story_relations_left_idx
  ON platform_news_story_relations (left_archive_id, relation);
CREATE INDEX IF NOT EXISTS platform_news_story_relations_right_idx
  ON platform_news_story_relations (right_archive_id, relation);

CREATE OR REPLACE FUNCTION tecpey_guard_news_story_relation()
RETURNS TRIGGER AS $
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'news story relation evidence cannot be deleted'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.relation_id IS DISTINCT FROM OLD.relation_id
     OR NEW.left_archive_id IS DISTINCT FROM OLD.left_archive_id
     OR NEW.right_archive_id IS DISTINCT FROM OLD.right_archive_id
     OR NEW.relation IS DISTINCT FROM OLD.relation
     OR NEW.evidence IS DISTINCT FROM OLD.evidence
     OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
     OR NEW.decision_hash IS DISTINCT FROM OLD.decision_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'news story relation evidence is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_news_story_relation_guard
  ON platform_news_story_relations;
CREATE TRIGGER platform_news_story_relation_guard
BEFORE UPDATE OR DELETE ON platform_news_story_relations
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_news_story_relation();

CREATE OR REPLACE FUNCTION tecpey_guard_news_story_cluster_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'news story cluster membership evidence cannot be deleted'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.cluster_id IS DISTINCT FROM OLD.cluster_id
     OR NEW.archive_id IS DISTINCT FROM OLD.archive_id
     OR NEW.membership IS DISTINCT FROM OLD.membership
     OR NEW.evidence IS DISTINCT FROM OLD.evidence
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at THEN
    RAISE EXCEPTION 'news story cluster membership evidence is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_news_story_cluster_membership_guard
  ON platform_news_story_cluster_members;
CREATE TRIGGER platform_news_story_cluster_membership_guard
BEFORE UPDATE OR DELETE ON platform_news_story_cluster_members
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_news_story_cluster_membership();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runNewsStoryClusterAuthorityMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(NEWS_STORY_CLUSTER_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-news-story-cluster] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(NEWS_STORY_CLUSTER_AUTHORITY_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
