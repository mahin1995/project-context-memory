import { describe, expect, it, vi } from "vitest";
import { runMemoryBackedTurn } from "../src/integrations/mcp";
import type { MemoryEngineClient } from "../src/integrations/mcp";

describe("runMemoryBackedTurn", () => {
  it("retrieves memories, builds a prompt, generates a response, and stores the interaction", async () => {
    const search = vi.fn().mockResolvedValue([
      {
        id: "entry-1",
        projectName: "billing-system",
        featureName: "subscription-renewal",
        taskType: "analysis",
        summary: "Renewal checks trial expiration before invoice generation.",
        decision: null,
        outcome: null,
        tags: ["billing"],
        filePaths: [],
        sourceThreadId: "thread-7",
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
        score: 0.93
      }
    ]);
    const store = vi.fn().mockResolvedValue({
      entry: {
        id: "entry-2",
        projectName: "billing-system",
        featureName: "subscription-renewal",
        taskType: "analysis",
        summary: "Validated renewal flow answer.",
        decision: "Validate before invoice.",
        outcome: "No invalid renewals.",
        tags: ["billing"],
        filePaths: ["src/billing/renewal.ts"],
        sourceThreadId: "thread-7",
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z"
      },
      rawLog: null
    });
    const client = {
      search,
      store
    } as unknown as MemoryEngineClient;

    const generate = vi.fn().mockResolvedValue({
      response: "We validate trial expiration before creating the invoice.",
      summary: "Validated renewal sequence with pre-invoice check.",
      decision: "Validate before invoice.",
      outcome: "No invalid renewals."
    });

    const result = await runMemoryBackedTurn(
      client,
      {
        query: "How do we avoid invalid subscription renewals?",
        projectName: "billing-system",
        featureName: "subscription-renewal",
        taskType: "analysis",
        sourceThreadId: "thread-7",
        tags: ["billing"],
        filePaths: ["src/billing/renewal.ts"]
      },
      {
        generate
      }
    );

    expect(search).toHaveBeenCalledWith({
      query: "How do we avoid invalid subscription renewals?",
      projectName: "billing-system",
      featureName: "subscription-renewal",
      taskType: "analysis",
      sourceThreadId: "thread-7",
      tags: ["billing"],
      limit: 5,
      minScore: undefined
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "How do we avoid invalid subscription renewals?"
      })
    );
    expect(store).toHaveBeenCalledWith({
      projectName: "billing-system",
      featureName: "subscription-renewal",
      taskType: "analysis",
      summary: "Validated renewal sequence with pre-invoice check.",
      decision: "Validate before invoice.",
      outcome: "No invalid renewals.",
      tags: ["billing"],
      filePaths: ["src/billing/renewal.ts"],
      sourceThreadId: "thread-7",
      prompt: result.prompt,
      response: "We validate trial expiration before creating the invoice.",
      analysis: undefined
    });
    expect(result.memories).toHaveLength(1);
  });

  it("supports logging only the original user query as prompt text", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const store = vi.fn().mockResolvedValue({
      entry: {
        id: "entry-3",
        projectName: "billing-system",
        featureName: "renewal",
        taskType: "analysis",
        summary: "Q: how | A: because",
        decision: null,
        outcome: null,
        tags: [],
        filePaths: [],
        sourceThreadId: null,
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z"
      },
      rawLog: null
    });
    const client = {
      search,
      store
    } as unknown as MemoryEngineClient;

    await runMemoryBackedTurn(
      client,
      {
        query: "how",
        projectName: "billing-system",
        featureName: "renewal",
        taskType: "analysis"
      },
      {
        includeComposedPromptInRawLog: false,
        generate: () => Promise.resolve({ response: "because" })
      }
    );

    expect(store).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "how"
      })
    );
  });
});
