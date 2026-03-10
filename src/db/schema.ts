import type { PoolClient } from "pg";
import { DatabaseSetupError } from "../core/errors";
import type { PostgresDbClient } from "./connection";
import { renderSetupSql } from "./setup-sql";

export const DEFAULT_SCHEMA_NAME = "public";

interface EnsureProjectContextSchemaInput {
  db: PostgresDbClient;
  schemaName?: string;
  embeddingDimensions: number;
}

function assertIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new DatabaseSetupError(
      `Invalid schema identifier "${value}". Use only letters, numbers, and underscores.`
    );
  }

  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value}"`;
}

function tableName(schemaName: string, table: string): string {
  return `${quoteIdentifier(schemaName)}.${quoteIdentifier(table)}`;
}

function parseDimensions(value: unknown): number | null {
  const candidate =
    typeof value === "object" && value !== null ? (value as { dimensions?: unknown }) : null;
  return typeof candidate?.dimensions === "number" ? candidate.dimensions : null;
}

async function readStoredDimensions(
  client: PoolClient,
  schemaName: string
): Promise<number | null> {
  const result = await client.query<{ value: unknown }>(
    `SELECT value FROM ${tableName(schemaName, "memory_store_meta")} WHERE key = $1`,
    ["embedding_dimensions"]
  );

  return parseDimensions(result.rows[0]?.value);
}

async function readExistingEmbeddingDimensions(
  client: PoolClient,
  schemaName: string
): Promise<number | null> {
  const result = await client.query<{ data_type: string | null }>(
    `
    SELECT format_type(a.atttypid, a.atttypmod) AS data_type
    FROM pg_attribute AS a
    INNER JOIN pg_class AS c ON c.oid = a.attrelid
    INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND c.relname = 'memory_entries'
      AND a.attname = 'embedding'
      AND NOT a.attisdropped
    `,
    [schemaName]
  );
  const dataType = result.rows[0]?.data_type;
  const match = dataType?.match(/^vector\((\d+)\)$/);

  return match ? Number(match[1]) : null;
}

export async function ensureProjectContextSchema(
  input: EnsureProjectContextSchemaInput
): Promise<void> {
  const schemaName = assertIdentifier(input.schemaName ?? DEFAULT_SCHEMA_NAME);

  if (!Number.isInteger(input.embeddingDimensions) || input.embeddingDimensions <= 0) {
    throw new DatabaseSetupError("Embedding dimensions must be a positive integer.");
  }

  try {
    await input.db.withTransaction(async (client) => {
      await input.db.enablePgvector(client);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${tableName(schemaName, "memory_store_meta")} (
          key text PRIMARY KEY,
          value jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      const storedDimensions = await readStoredDimensions(client, schemaName);
      const existingDimensions = await readExistingEmbeddingDimensions(client, schemaName);
      const knownDimensions = existingDimensions ?? storedDimensions;

      if (knownDimensions !== null && knownDimensions !== input.embeddingDimensions) {
        throw new DatabaseSetupError(
          `Schema "${schemaName}" is already initialized with embedding dimension ${knownDimensions}. Requested ${input.embeddingDimensions}.`
        );
      }

      await client.query(renderSetupSql(schemaName, input.embeddingDimensions));
      await client.query(
        `
        INSERT INTO ${tableName(schemaName, "memory_store_meta")} (key, value, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        `,
        ["embedding_dimensions", JSON.stringify({ dimensions: input.embeddingDimensions })]
      );
    });
  } catch (error) {
    throw new DatabaseSetupError(
      `Failed to initialize PostgreSQL memory schema "${schemaName}": ${
        error instanceof Error ? error.message : "Unknown database error."
      }`,
      {
        cause: error instanceof Error ? error : undefined
      }
    );
  }
}
