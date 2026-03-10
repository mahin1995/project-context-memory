import { describe, expect, it } from "vitest";
import { renderSetupSql } from "../src/db/setup-sql";

describe("renderSetupSql", () => {
  it("renders the required tables, indexes, and vector guidance", () => {
    const sql = renderSetupSql("memory_schema", 384);

    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS memory_schema.memory_entries");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS memory_schema.memory_raw_logs");
    expect(sql).toContain("memory_schema_memory_entries_project_name_idx");
    expect(sql).toContain("memory_schema_memory_entries_feature_name_idx");
    expect(sql).toContain("memory_schema_memory_entries_task_type_idx");
    expect(sql).toContain("memory_schema_memory_entries_created_at_idx");
    expect(sql).toContain("memory_schema_memory_raw_logs_memory_entry_id_idx");
    expect(sql).toContain("embedding vector(384)");
    expect(sql).toContain("vector_cosine_ops");
    expect(sql).toContain("ANALYZE memory_schema.memory_entries");
  });
});
