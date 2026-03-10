import type { PoolClient } from "pg";
import { createId } from "../utils/ids";
import { resolveDbClient } from "./connection";
import type { PostgresDbClient } from "./connection";
import { DEFAULT_SCHEMA_NAME, ensureProjectContextSchema } from "./schema";
import type {
  InsertMemoryRawLogInput,
  MemoryEntryRecord,
  MemoryRawLogRecord,
  MemorySearchResult,
  UpsertMemoryEntryInput,
  ValidatedMemorySearchInput
} from "../types/memory";
import type { ProjectContextMemoryOptions } from "../types/project";

interface MemoryEntryRow {
  id: string;
  project_name: string;
  feature_name: string;
  task_type: string;
  summary: string;
  decision: string | null;
  outcome: string | null;
  tags: string[];
  file_paths: string[];
  source_thread_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface MemorySearchRow extends MemoryEntryRow {
  semantic_score: number;
  score: number;
}

interface MemoryRawLogRow {
  id: string;
  memory_entry_id: string;
  prompt: string | null;
  response: string | null;
  analysis: string | null;
  created_at: Date;
}

function quoteIdentifier(value: string): string {
  return `"${value}"`;
}

function tableName(schemaName: string, table: string): string {
  return `${quoteIdentifier(schemaName)}.${quoteIdentifier(table)}`;
}

function mapMemoryEntry(row: MemoryEntryRow): MemoryEntryRecord {
  return {
    id: row.id,
    projectName: row.project_name,
    featureName: row.feature_name,
    taskType: row.task_type,
    summary: row.summary,
    decision: row.decision,
    outcome: row.outcome,
    tags: row.tags,
    filePaths: row.file_paths,
    sourceThreadId: row.source_thread_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapMemorySearchResult(row: MemorySearchRow): MemorySearchResult {
  return {
    ...mapMemoryEntry(row),
    score: row.score
  };
}

function mapRawLog(row: MemoryRawLogRow): MemoryRawLogRecord {
  return {
    id: row.id,
    memoryEntryId: row.memory_entry_id,
    prompt: row.prompt,
    response: row.response,
    analysis: row.analysis,
    createdAt: row.created_at.toISOString()
  };
}

const HYBRID_RANKING_WEIGHTS = {
  projectMatch: 0.2,
  featureMatch: 0.12,
  taskTypeMatch: 0.08,
  maxRecencyBoost: 0.1,
  recencyWindowSeconds: 30 * 24 * 60 * 60
} as const;

export function buildHybridSearchQuery(memoryEntriesTable: string): string {
  return `
    WITH filtered_entries AS (
      SELECT
        id,
        project_name,
        feature_name,
        task_type,
        summary,
        decision,
        outcome,
        tags,
        file_paths,
        source_thread_id,
        created_at,
        updated_at,
        1 - (embedding <=> $1::vector) AS semantic_score
      FROM ${memoryEntriesTable}
      WHERE ($2::text IS NULL OR project_name = $2)
        AND ($3::text IS NULL OR feature_name = $3)
        AND ($4::text IS NULL OR task_type = $4)
        AND ($5::text IS NULL OR source_thread_id = $5)
        AND ($6::text[] IS NULL OR tags && $6::text[])
    ),
    ranked_entries AS (
      SELECT
        id,
        project_name,
        feature_name,
        task_type,
        summary,
        decision,
        outcome,
        tags,
        file_paths,
        source_thread_id,
        created_at,
        updated_at,
        semantic_score,
        CASE
          WHEN $2::text IS NOT NULL AND project_name = $2 THEN ${HYBRID_RANKING_WEIGHTS.projectMatch}
          ELSE 0
        END AS project_boost,
        CASE
          WHEN $3::text IS NOT NULL AND feature_name = $3 THEN ${HYBRID_RANKING_WEIGHTS.featureMatch}
          ELSE 0
        END AS feature_boost,
        CASE
          WHEN $4::text IS NOT NULL AND task_type = $4 THEN ${HYBRID_RANKING_WEIGHTS.taskTypeMatch}
          ELSE 0
        END AS task_type_boost,
        LEAST(
          ${HYBRID_RANKING_WEIGHTS.maxRecencyBoost}::double precision,
          GREATEST(
            0::double precision,
            ${HYBRID_RANKING_WEIGHTS.maxRecencyBoost}::double precision * (
              1 - (
                EXTRACT(EPOCH FROM (now() - updated_at)) /
                ${HYBRID_RANKING_WEIGHTS.recencyWindowSeconds}.0
              )
            )
          )
        ) AS recency_boost
      FROM filtered_entries
    )
    SELECT
      id,
      project_name,
      feature_name,
      task_type,
      summary,
      decision,
      outcome,
      tags,
      file_paths,
      source_thread_id,
      created_at,
      updated_at,
      semantic_score,
      semantic_score + project_boost + feature_boost + task_type_boost + recency_boost AS score
    FROM ranked_entries
    WHERE ($7::double precision IS NULL OR semantic_score >= $7)
    ORDER BY score DESC, semantic_score DESC, updated_at DESC
    LIMIT $8
  `;
}

export class PostgresMemoryStore {
  private readonly db: PostgresDbClient;
  private readonly schemaName: string;
  private readonly embeddingDimensions: number;
  private readonly autoMigrate: boolean;
  private readonly memoryEntriesTable: string;
  private readonly memoryRawLogsTable: string;

  constructor(options: ProjectContextMemoryOptions & { embeddingDimensions: number }) {
    this.db = resolveDbClient({
      postgresUrl: options.postgresUrl,
      connectionString: options.connectionString,
      pool: options.pool,
      poolConfig: options.poolConfig
    });
    this.schemaName = options.schemaName ?? DEFAULT_SCHEMA_NAME;
    this.embeddingDimensions = options.embeddingDimensions;
    this.autoMigrate = options.autoMigrate ?? true;
    this.memoryEntriesTable = tableName(this.schemaName, "memory_entries");
    this.memoryRawLogsTable = tableName(this.schemaName, "memory_raw_logs");
  }

  async setup(): Promise<void> {
    if (!this.autoMigrate) {
      return;
    }

    await ensureProjectContextSchema({
      db: this.db,
      schemaName: this.schemaName,
      embeddingDimensions: this.embeddingDimensions
    });
  }

  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.db.withTransaction(callback);
  }

  async upsertMemoryEntry(
    input: UpsertMemoryEntryInput,
    client?: PoolClient
  ): Promise<MemoryEntryRecord> {
    const result = await this.db.query<MemoryEntryRow>(
      `
      INSERT INTO ${this.memoryEntriesTable} (
        id,
        project_name,
        feature_name,
        task_type,
        summary,
        decision,
        outcome,
        tags,
        file_paths,
        source_thread_id,
        embedding
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::text[],
        $9::text[],
        $10,
        $11
      )
      ON CONFLICT (project_name, feature_name, task_type, summary)
      DO UPDATE SET
        decision = CASE
          WHEN EXCLUDED.decision IS NOT NULL THEN EXCLUDED.decision
          ELSE ${this.memoryEntriesTable}.decision
        END,
        outcome = CASE
          WHEN EXCLUDED.outcome IS NOT NULL THEN EXCLUDED.outcome
          ELSE ${this.memoryEntriesTable}.outcome
        END,
        tags = ARRAY(
          SELECT DISTINCT item
          FROM unnest(${this.memoryEntriesTable}.tags || EXCLUDED.tags) AS item
          WHERE item IS NOT NULL AND item <> ''
        ),
        file_paths = ARRAY(
          SELECT DISTINCT item
          FROM unnest(${this.memoryEntriesTable}.file_paths || EXCLUDED.file_paths) AS item
          WHERE item IS NOT NULL AND item <> ''
        ),
        source_thread_id = COALESCE(EXCLUDED.source_thread_id, ${this.memoryEntriesTable}.source_thread_id),
        updated_at = now(),
        embedding = EXCLUDED.embedding
      RETURNING *
      `,
      [
        createId(),
        input.projectName,
        input.featureName,
        input.taskType,
        input.summary,
        input.decision,
        input.outcome,
        input.tags,
        input.filePaths,
        input.sourceThreadId,
        this.db.toSql(input.embedding)
      ],
      client
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("Failed to upsert memory entry.");
    }

    return mapMemoryEntry(row);
  }

  async insertRawLog(
    input: InsertMemoryRawLogInput,
    client?: PoolClient
  ): Promise<MemoryRawLogRecord> {
    const result = await this.db.query<MemoryRawLogRow>(
      `
      INSERT INTO ${this.memoryRawLogsTable} (
        id,
        memory_entry_id,
        prompt,
        response,
        analysis
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [createId(), input.memoryEntryId, input.prompt, input.response, input.analysis],
      client
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("Failed to insert memory raw log.");
    }

    return mapRawLog(row);
  }

  async searchMemoryEntries(input: {
    embedding: number[];
    filters: ValidatedMemorySearchInput;
  }): Promise<MemorySearchResult[]> {
    const params: unknown[] = [
      this.db.toSql(input.embedding),
      input.filters.projectName,
      input.filters.featureName,
      input.filters.taskType,
      input.filters.sourceThreadId,
      input.filters.tags.length > 0 ? input.filters.tags : null,
      input.filters.minScore,
      input.filters.limit
    ];

    const result = await this.db.query<MemorySearchRow>(
      buildHybridSearchQuery(this.memoryEntriesTable),
      params
    );

    return result.rows.map(mapMemorySearchResult);
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

export { PostgresMemoryStore as PostgresProjectContextStore };
