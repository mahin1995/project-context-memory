import type { Pool, PoolConfig } from "pg";
import type { EmbeddingProvider } from "../embeddings/provider";
import type { JsonRecord } from "./json";

export interface ProjectProfile {
  projectId: string;
  name: string | null;
  description: string | null;
  tags: string[];
  metadata: JsonRecord;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertProjectProfileInput {
  projectId: string;
  name?: string;
  description?: string;
  tags?: string[];
  metadata?: JsonRecord;
  mergeMetadata?: boolean;
}

export interface EmbeddingConfig {
  model?: string;
  dimensions?: number;
}

export interface ProjectContextMemoryOptions {
  postgresUrl?: string;
  connectionString?: string;
  pool?: Pool;
  poolConfig?: Omit<PoolConfig, "connectionString">;
  embeddingProvider: EmbeddingProvider;
  embedding?: EmbeddingConfig;
  schemaName?: string;
  autoMigrate?: boolean;
}
