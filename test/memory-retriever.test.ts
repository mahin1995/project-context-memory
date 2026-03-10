import { describe, expect, it, vi } from "vitest";
import { MemoryRetriever } from "../src/retrieval/memory-retriever";
import { BaseEmbeddingProvider } from "../src/embeddings/provider";
import type { PostgresMemoryStore } from "../src/db/postgres-project-context-store";

class QueryEmbeddingProvider extends BaseEmbeddingProvider {
  constructor() {
    super({
      model: "text-embedding-3-small",
      dimensions: 3
    });
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map(() => [0.1, 0.2, 0.3]));
  }

  embedQuery(): Promise<number[]> {
    return Promise.resolve([0.3, 0.2, 0.1]);
  }
}

describe("MemoryRetriever", () => {
  it("normalizes filters and delegates vector search to the store", async () => {
    const searchMemoryEntries = vi.fn().mockResolvedValue([
      {
        id: "entry-1",
        projectName: "billing-system",
        featureName: "subscription-renewal",
        taskType: "analysis",
        summary: "Renewal flow validates trial expiration before invoice generation.",
        decision: "Validate before invoice creation.",
        outcome: "Prevents invalid renewals.",
        tags: ["billing"],
        filePaths: [],
        sourceThreadId: "thread-1",
        createdAt: "2026-03-10T00:00:00.000Z",
        updatedAt: "2026-03-10T00:00:00.000Z",
        score: 0.98
      }
    ]);
    const retriever = new MemoryRetriever({
      store: {
        searchMemoryEntries
      } as unknown as PostgresMemoryStore,
      embeddingProvider: new QueryEmbeddingProvider(),
      embeddingDimensions: 3
    });

    const results = await retriever.search({
      query: " How did we handle renewal validation? ",
      projectName: " billing-system ",
      featureName: " subscription-renewal ",
      taskType: " analysis ",
      tags: [" Billing "],
      sourceThreadId: " thread-1 ",
      limit: 3
    });

    expect(results).toHaveLength(1);
    expect(searchMemoryEntries).toHaveBeenCalledWith({
      embedding: [0.3, 0.2, 0.1],
      filters: {
        query: "How did we handle renewal validation?",
        projectName: "billing-system",
        featureName: "subscription-renewal",
        taskType: "analysis",
        tags: ["billing"],
        sourceThreadId: "thread-1",
        limit: 3,
        minScore: null
      }
    });
  });
});
