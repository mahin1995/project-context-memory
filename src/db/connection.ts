import { Pool } from "pg";
import pgvector from "pgvector";
import pgvectorPg from "pgvector/pg";
import type { PoolClient, PoolConfig, QueryResult, QueryResultRow } from "pg";
import { ConfigurationError } from "../core/errors";

interface ResolvePoolInput {
  postgresUrl?: string;
  connectionString?: string;
  pool?: Pool;
  poolConfig?: Omit<PoolConfig, "connectionString">;
}

export class PostgresDbClient {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;
  private pgvectorReady = false;

  constructor(input: ResolvePoolInput) {
    if (input.pool) {
      this.pool = input.pool;
      this.ownsPool = false;
    } else {
      const connectionString = input.postgresUrl ?? input.connectionString;

      if (!connectionString) {
        throw new ConfigurationError(
          "Provide either `postgresUrl`, `connectionString`, or an existing pg Pool."
        );
      }

      this.pool = new Pool({
        connectionString,
        ...input.poolConfig
      });
      this.ownsPool = true;
    }

    this.pool.on("connect", (client) => {
      if (!this.pgvectorReady) {
        return;
      }

      void pgvectorPg.registerTypes(client).catch(() => undefined);
    });
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
    client?: PoolClient
  ): Promise<QueryResult<Row>> {
    return (client ?? this.pool).query<Row>(text, values);
  }

  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async enablePgvector(client: PoolClient): Promise<void> {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await pgvectorPg.registerTypes(client);
    this.pgvectorReady = true;
  }

  toSql(vector: number[]): string {
    return pgvector.toSql(vector) as string;
  }

  async close(): Promise<void> {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }
}

export function resolveDbClient(input: ResolvePoolInput): PostgresDbClient {
  return new PostgresDbClient(input);
}
