import { describe, expect, it } from "vitest";
import {
  buildConversationMemoryDocuments,
  buildStandaloneMemoryDocument
} from "../src/memory/build-memory-documents";

describe("buildConversationMemoryDocuments", () => {
  it("creates semantic memory documents for summaries, decisions, outcomes, and project metadata", () => {
    const memories = buildConversationMemoryDocuments(
      {
        projectId: "checkout-service",
        sessionId: "run-7",
        prompt: {
          summary: "Asked the agent to debug a payment timeout."
        },
        response: {
          summary: "Found the timeout source in retry middleware."
        },
        analysis: {
          summary: "The regression started after a client library upgrade."
        },
        decisions: ["Pin the dependency version."],
        outcomes: ["Timeout rates returned to baseline."],
        tags: ["Payments", "Incident"],
        metadata: {
          ticket: "PAY-7"
        },
        project: {
          name: "Checkout Service",
          description: "Handles payment authorization.",
          metadata: {
            owner: "payments-platform"
          }
        }
      },
      {
        sourceLogId: "log-123"
      }
    );

    expect(memories).toHaveLength(6);
    expect(memories.map((memory) => memory.kind)).toEqual([
      "prompt_summary",
      "response_summary",
      "analysis_summary",
      "decision",
      "outcome",
      "project_metadata"
    ]);
    expect(memories.every((memory) => memory.projectId === "checkout-service")).toBe(true);
    expect(memories.every((memory) => memory.sourceLogId === "log-123")).toBe(true);
    expect(memories[0]?.tags).toEqual(["payments", "incident"]);
    expect(memories[5]?.summary).toContain("Checkout Service");
  });
});

describe("buildStandaloneMemoryDocument", () => {
  it("normalizes tags and preserves memory details", () => {
    const memory = buildStandaloneMemoryDocument({
      projectId: "analytics-api",
      kind: "note",
      title: "Incident note",
      summary: "Manual rollback was safe because no schema migration had shipped.",
      tags: [" Rollback ", "Incident", "incident"],
      details: {
        severity: "high"
      }
    });

    expect(memory.kind).toBe("note");
    expect(memory.title).toBe("Incident note");
    expect(memory.tags).toEqual(["rollback", "incident"]);
    expect(memory.details).toEqual({
      severity: "high"
    });
    expect(memory.embeddingText).toContain("Kind: note");
  });
});
