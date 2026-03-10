import { describe, expect, it, vi } from "vitest";
import { BaseEmbeddingProvider } from "../src/embeddings/provider";
import { ProjectContextMemory } from "../src/core/project-context-memory";
import { MemoryRetriever } from "../src/retrieval/memory-retriever";
import { MemoryWriter } from "../src/memory/memory-writer";
import { PostgresMemoryStore } from "../src/db/postgres-project-context-store";

class DemoEmbeddingProvider extends BaseEmbeddingProvider {
  constructor() {
    super({
      model: "text-embedding-3-small"
    });
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map(() => Array.from({ length: 1536 }, () => 0.01)));
  }

  embedQuery(): Promise<number[]> {
    return Promise.resolve(Array.from({ length: 1536 }, () => 0.01));
  }
}

describe("ProjectContextMemory", () => {
  it("runs setup lazily only once and routes store/search through the new services", async () => {
    const setupSpy = vi.spyOn(PostgresMemoryStore.prototype, "setup").mockResolvedValue(undefined);
    const writerSpy = vi.spyOn(MemoryWriter.prototype, "write").mockResolvedValue({
      entry: {
        id: "entry-1",
        projectName: "billing-system",
        featureName: "subscription-renewal",
        taskType: "analysis",
        summary: "Renewal flow validates trial expiration before invoice generation.",
        decision: null,
        outcome: null,
        tags: [],
        filePaths: [],
        sourceThreadId: null,
        createdAt: "2026-03-10T00:00:00.000Z",
        updatedAt: "2026-03-10T00:00:00.000Z"
      },
      rawLog: null
    });
    const searchSpy = vi.spyOn(MemoryRetriever.prototype, "search").mockResolvedValue([]);
    const closeSpy = vi.spyOn(PostgresMemoryStore.prototype, "close").mockResolvedValue(undefined);
    const memory = new ProjectContextMemory({
      postgresUrl: "postgres://user:pass@localhost:5432/app",
      embeddingProvider: new DemoEmbeddingProvider()
    });

    await memory.store({
      projectName: "billing-system",
      featureName: "subscription-renewal",
      taskType: "analysis",
      summary: "Renewal flow validates trial expiration before invoice generation."
    });
    await memory.search({
      query: "How did we handle renewal validation?"
    });
    await memory.close();

    expect(setupSpy).toHaveBeenCalledTimes(1);
    expect(writerSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves default embedding dimensions from the provider model", () => {
    const memory = new ProjectContextMemory({
      postgresUrl: "postgres://user:pass@localhost:5432/app",
      embeddingProvider: new DemoEmbeddingProvider()
    });

    expect(memory).toBeInstanceOf(ProjectContextMemory);
  });
});
