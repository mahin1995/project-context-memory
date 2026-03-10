import { describe, expect, it } from "vitest";
import { buildContextString } from "../src/retrieval/context-retriever";
import {
  buildLangGraphStatePatch,
  retrieveRelevantMemories,
  saveInteractionAsMemory
} from "../src/integrations/langgraph";
import type {
  MemorySearchResult,
  MemoryWriteResult,
  RetrievedContext
} from "../src/types/memory";

const context: RetrievedContext = {
  projectId: "search-indexer",
  query: "Why was the index rebuild delayed?",
  retrievedAt: "2026-03-10T10:00:00.000Z",
  project: {
    projectId: "search-indexer",
    name: "Search Indexer",
    description: "Builds search indices from event streams.",
    tags: ["search", "backend"],
    metadata: {
      owner: "platform"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-03-10T09:00:00.000Z"
  },
  memories: [
    {
      id: "memory-1",
      projectId: "search-indexer",
      sourceLogId: "log-1",
      sessionId: "session-1",
      kind: "decision",
      title: "Decision 1",
      summary: "Delay the rebuild until backfill throughput is stable.",
      details: {
        source: "conversation"
      },
      tags: ["search"],
      metadata: {},
      occurredAt: "2026-03-09T08:00:00.000Z",
      createdAt: "2026-03-09T08:00:00.000Z",
      updatedAt: "2026-03-09T08:00:00.000Z",
      score: 0.97
    }
  ],
  rawLogs: [
    {
      id: "log-1",
      projectId: "search-indexer",
      sessionId: "session-1",
      promptText: null,
      promptSummary: "Investigate the delayed rebuild.",
      responseText: null,
      responseSummary: "The worker pool was saturated by backfill traffic.",
      analysisText: null,
      analysisSummary: "Backfill and rebuild jobs compete for the same queue.",
      tags: ["search"],
      metadata: {},
      occurredAt: "2026-03-09T08:00:00.000Z",
      createdAt: "2026-03-09T08:00:00.000Z"
    }
  ],
  contextText: ""
};

describe("buildContextString", () => {
  it("formats project, memory, and raw log sections", () => {
    const text = buildContextString(context);

    expect(text).toContain("Project name: Search Indexer");
    expect(text).toContain("[decision] Delay the rebuild until backfill throughput is stable.");
    expect(text).toContain("Prompt: Investigate the delayed rebuild.");
  });
});

describe("buildLangGraphStatePatch", () => {
  it("creates a stable LangGraph-compatible state payload", () => {
    const patch = buildLangGraphStatePatch(context, {
      stateKey: "memoryState"
    });
    const state = patch.memoryState;

    expect(state).toBeDefined();
    expect(state?.projectId).toBe("search-indexer");
    expect(state?.contextText).toContain("Relevant memories");
    expect(state?.memories).toHaveLength(1);
  });
});

describe("LangGraph helpers", () => {
  it("delegates retrieval through any memory search client", async () => {
    const results: MemorySearchResult[] = [
      {
        id: "entry-1",
        projectName: "search-indexer",
        featureName: "rebuild-queue",
        taskType: "analysis",
        summary: "Backfill traffic saturated the rebuild workers.",
        decision: null,
        outcome: null,
        tags: ["search"],
        filePaths: [],
        sourceThreadId: "thread-1",
        createdAt: "2026-03-10T10:00:00.000Z",
        updatedAt: "2026-03-10T10:00:00.000Z",
        score: 0.95
      }
    ];
    const client = {
      search: () => Promise.resolve(results)
    };

    await expect(
      retrieveRelevantMemories(client, {
        query: "Why was the rebuild delayed?",
        projectName: "search-indexer"
      })
    ).resolves.toEqual(results);
  });

  it("delegates memory persistence through any memory store client", async () => {
    const writeResult: MemoryWriteResult = {
      entry: {
        id: "entry-2",
        projectName: "search-indexer",
        featureName: "rebuild-queue",
        taskType: "analysis",
        summary: "Rebuild jobs were delayed until the backfill queue drained.",
        decision: "Delay the rebuild.",
        outcome: "Queue pressure dropped.",
        tags: ["search"],
        filePaths: [],
        sourceThreadId: "thread-2",
        createdAt: "2026-03-10T10:05:00.000Z",
        updatedAt: "2026-03-10T10:05:00.000Z"
      },
      rawLog: null
    };
    const client = {
      store: () => Promise.resolve(writeResult)
    };

    await expect(
      saveInteractionAsMemory(client, {
        projectName: "search-indexer",
        featureName: "rebuild-queue",
        taskType: "analysis",
        summary: "Rebuild jobs were delayed until the backfill queue drained."
      })
    ).resolves.toEqual(writeResult);
  });
});
