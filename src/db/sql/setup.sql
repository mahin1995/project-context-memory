-- Project Context Memory setup
-- This file is the readable SQL reference for the runtime setup logic.
-- The runtime setup renders the schema name and embedding dimensions dynamically.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS {{schema_name}};

CREATE TABLE IF NOT EXISTS {{schema_name}}.memory_store_meta (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS {{schema_name}}.memory_entries (
  id uuid PRIMARY KEY,
  project_name text NOT NULL,
  feature_name text NOT NULL,
  task_type text NOT NULL,
  summary text NOT NULL,
  decision text NULL,
  outcome text NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  file_paths text[] NOT NULL DEFAULT '{}'::text[],
  source_thread_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  embedding vector({{embedding_dimensions}}) NOT NULL
);

CREATE TABLE IF NOT EXISTS {{schema_name}}.memory_raw_logs (
  id uuid PRIMARY KEY,
  memory_entry_id uuid NOT NULL REFERENCES {{schema_name}}.memory_entries(id) ON DELETE CASCADE,
  prompt text NULL,
  response text NULL,
  analysis text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS {{schema_name}}_memory_entries_dedupe_idx
  ON {{schema_name}}.memory_entries (project_name, feature_name, task_type, summary);

CREATE INDEX IF NOT EXISTS {{schema_name}}_memory_entries_project_name_idx
  ON {{schema_name}}.memory_entries (project_name);

CREATE INDEX IF NOT EXISTS {{schema_name}}_memory_entries_feature_name_idx
  ON {{schema_name}}.memory_entries (feature_name);

CREATE INDEX IF NOT EXISTS {{schema_name}}_memory_entries_task_type_idx
  ON {{schema_name}}.memory_entries (task_type);

CREATE INDEX IF NOT EXISTS {{schema_name}}_memory_entries_created_at_idx
  ON {{schema_name}}.memory_entries (created_at DESC);

CREATE INDEX IF NOT EXISTS {{schema_name}}_memory_entries_source_thread_id_idx
  ON {{schema_name}}.memory_entries (source_thread_id);

CREATE INDEX IF NOT EXISTS {{schema_name}}_memory_entries_tags_idx
  ON {{schema_name}}.memory_entries USING GIN (tags);

CREATE INDEX IF NOT EXISTS {{schema_name}}_memory_raw_logs_memory_entry_id_idx
  ON {{schema_name}}.memory_raw_logs (memory_entry_id, created_at DESC);

-- Vector index guidance:
-- For larger datasets, add an approximate index after enough rows exist.
-- Cosine distance matches the default search implementation:
--
-- CREATE INDEX IF NOT EXISTS {{schema_name}}_memory_entries_embedding_ivfflat_idx
--   ON {{schema_name}}.memory_entries
--   USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);
--
-- After creating an approximate index, refresh planner stats:
-- ANALYZE {{schema_name}}.memory_entries;
--
-- For read-heavy workloads, HNSW can also be considered:
-- CREATE INDEX IF NOT EXISTS {{schema_name}}_memory_entries_embedding_hnsw_idx
--   ON {{schema_name}}.memory_entries
--   USING hnsw (embedding vector_cosine_ops);
