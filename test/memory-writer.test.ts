import { describe, expect, it, vi } from "vitest";
import { MemoryWriter } from "../src/memory/memory-writer";
import { BaseEmbeddingProvider } from "../src/embeddings/provider";
import type { MemoryWriteResult } from "../src/types/memory";
import type { PostgresMemoryStore } from "../src/db/postgres-project-context-store";

class TestEmbeddingProvider extends BaseEmbeddingProvider {
  constructor() {
    super({
      model: "text-embedding-3-small",
      dimensions: 3
    });
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map(() => [0.1, 0.2, 0.3]));
  }

  embedQuery(text: string): Promise<number[]> {
    return Promise.resolve([text.length, 0, 0]);
  }
}

function createStoreMock(result: MemoryWriteResult) {
  const upsertMemoryEntry = vi.fn().mockResolvedValue(result.entry);
  const insertRawLog = vi.fn().mockResolvedValue(result.rawLog);
  const withTransaction = vi.fn(async (callback: (client: object) => Promise<unknown>) =>
    callback({})
  );

  return {
    upsertMemoryEntry,
    insertRawLog,
    withTransaction
  } as unknown as PostgresMemoryStore;
}

describe("MemoryWriter", () => {
  it("writes summary embeddings and raw logs separately", async () => {
    const embedDocuments = vi.spyOn(TestEmbeddingProvider.prototype, "embedDocuments");
    const writeResult: MemoryWriteResult = {
      entry: {
        id: "entry-1",
        projectName: "billing-system",
        featureName: "subscription-renewal",
        taskType: "analysis",
        summary: "Renewal flow validates trial expiration before invoice generation.",
        decision: "Validate before invoice creation.",
        outcome: "Prevents invalid renewals.",
        tags: ["billing", "renewal", "validation"],
        filePaths: ["src/billing/renewal.ts"],
        sourceThreadId: "thread-1",
        createdAt: "2026-03-10T00:00:00.000Z",
        updatedAt: "2026-03-10T00:00:00.000Z"
      },
      rawLog: {
        id: "raw-1",
        memoryEntryId: "entry-1",
        prompt: "prompt",
        response: "response",
        analysis: "analysis",
        createdAt: "2026-03-10T00:00:00.000Z"
      }
    };
    const store = createStoreMock(writeResult);
    const writer = new MemoryWriter({
      store,
      embeddingProvider: new TestEmbeddingProvider(),
      embeddingDimensions: 3
    });

    const result = await writer.write({
      projectName: " billing-system ",
      featureName: " subscription-renewal ",
      taskType: " analysis ",
      summary: " Renewal flow validates trial expiration before invoice generation. ",
      decision: " Validate before invoice creation. ",
      outcome: " Prevents invalid renewals. ",
      tags: [" Billing ", "renewal", "renewal"],
      filePaths: [" src/billing/renewal.ts "],
      sourceThreadId: " thread-1 ",
      prompt: " prompt ",
      response: " response ",
      analysis: " analysis "
    });

    expect(embedDocuments).toHaveBeenCalledWith([
      "Renewal flow validates trial expiration before invoice generation."
    ]);
    expect(result).toEqual(writeResult);
    expect((store as unknown as { upsertMemoryEntry: ReturnType<typeof vi.fn> }).upsertMemoryEntry)
      .toHaveBeenCalled();
    expect((store as unknown as { insertRawLog: ReturnType<typeof vi.fn> }).insertRawLog)
      .toHaveBeenCalled();
  });

  it("skips raw log writes when no raw values are provided", async () => {
    const writeResult: MemoryWriteResult = {
      entry: {
        id: "entry-2",
        projectName: "billing-system",
        featureName: "subscription-renewal",
        taskType: "analysis",
        summary: "Renewal flow validates trial expiration before invoice generation.",
        decision: null,
        outcome: null,
        tags: ["billing"],
        filePaths: [],
        sourceThreadId: null,
        createdAt: "2026-03-10T00:00:00.000Z",
        updatedAt: "2026-03-10T00:00:00.000Z"
      },
      rawLog: null
    };
    const store = createStoreMock(writeResult);
    const writer = new MemoryWriter({
      store,
      embeddingProvider: new TestEmbeddingProvider(),
      embeddingDimensions: 3
    });

    await writer.write({
      projectName: "billing-system",
      featureName: "subscription-renewal",
      taskType: "analysis",
      summary: "Renewal flow validates trial expiration before invoice generation."
    });

    expect((store as unknown as { insertRawLog: ReturnType<typeof vi.fn> }).insertRawLog)
      .not.toHaveBeenCalled();
  });
});
