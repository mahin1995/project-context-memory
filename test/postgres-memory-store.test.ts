import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  close: vi.fn(),
  toSql: vi.fn(() => "[0.3,0.2,0.1]"),
  ensureProjectContextSchema: vi.fn()
}));

vi.mock("../src/db/connection", () => ({
  resolveDbClient: () => ({
    query: mocks.query,
    withTransaction: mocks.withTransaction,
    close: mocks.close,
    toSql: mocks.toSql
  })
}));

vi.mock("../src/db/schema", () => ({
  DEFAULT_SCHEMA_NAME: "public",
  ensureProjectContextSchema: mocks.ensureProjectContextSchema
}));

import {
  PostgresMemoryStore,
  buildHybridSearchQuery
} from "../src/db/postgres-project-context-store";

describe("PostgresMemoryStore search", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.withTransaction.mockReset();
    mocks.close.mockReset();
    mocks.toSql.mockClear();
    mocks.ensureProjectContextSchema.mockReset();
  });

  it("uses a readable hybrid-ranking SQL query with filters and returns mapped results", async () => {
    mocks.query.mockResolvedValue({
      rows: [
        {
          id: "entry-1",
          project_name: "billing-system",
          feature_name: "subscription-renewal",
          task_type: "analysis",
          summary: "Renewal flow validates trial expiration before invoice generation.",
          decision: "Validate before invoice creation.",
          outcome: "Prevents invalid renewals.",
          tags: ["billing", "renewal"],
          file_paths: ["src/billing/renewal.ts"],
          source_thread_id: "thread-1",
          created_at: new Date("2026-03-09T00:00:00.000Z"),
          updated_at: new Date("2026-03-10T00:00:00.000Z"),
          semantic_score: 0.82,
          score: 1.14
        }
      ]
    });

    const store = new PostgresMemoryStore({
      postgresUrl: "postgres://user:pass@localhost:5432/app",
      embeddingProvider: {
        embedDocuments: vi.fn(),
        embedQuery: vi.fn()
      },
      embeddingDimensions: 3
    });

    const results = await store.searchMemoryEntries({
      embedding: [0.3, 0.2, 0.1],
      filters: {
        query: "renewal validation",
        projectName: "billing-system",
        featureName: "subscription-renewal",
        taskType: "analysis",
        tags: ["billing"],
        sourceThreadId: "thread-1",
        limit: 5,
        minScore: 0.6
      }
    });

    expect(results).toEqual([
      {
        id: "entry-1",
        projectName: "billing-system",
        featureName: "subscription-renewal",
        taskType: "analysis",
        summary: "Renewal flow validates trial expiration before invoice generation.",
        decision: "Validate before invoice creation.",
        outcome: "Prevents invalid renewals.",
        tags: ["billing", "renewal"],
        filePaths: ["src/billing/renewal.ts"],
        sourceThreadId: "thread-1",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-10T00:00:00.000Z",
        score: 1.14
      }
    ]);

    expect(mocks.toSql).toHaveBeenCalledWith([0.3, 0.2, 0.1]);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("WITH filtered_entries AS"),
      ["[0.3,0.2,0.1]", "billing-system", "subscription-renewal", "analysis", "thread-1", ["billing"], 0.6, 5]
    );

    const firstCall = mocks.query.mock.calls[0];
    const sql = typeof firstCall?.[0] === "string" ? firstCall[0] : "";
    expect(sql).toContain("source_thread_id = $5");
    expect(sql).toContain("tags && $6::text[]");
    expect(sql).toContain("semantic_score + project_boost + feature_boost + task_type_boost + recency_boost AS score");
    expect(sql).toContain("WHERE ($7::double precision IS NULL OR semantic_score >= $7)");
    expect(sql).toContain("ORDER BY score DESC, semantic_score DESC, updated_at DESC");
  });

  it("builds the hybrid search query with fixed ranking weights", () => {
    const sql = buildHybridSearchQuery("\"public\".\"memory_entries\"");

    expect(sql).toContain("0.2");
    expect(sql).toContain("0.12");
    expect(sql).toContain("0.08");
    expect(sql).toContain("2592000.0");
    expect(sql).toContain("\"public\".\"memory_entries\"");
  });
});
