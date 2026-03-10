import { ConfigurationError } from "../core/errors";
import type {
  CaptureConversationInput,
  MemoryDraft,
  RememberInput
} from "../types/memory";
import type { JsonRecord } from "../types/json";
import { createId } from "../utils/ids";
import { normalizeTags } from "../utils/tags";
import { buildEmbeddingText, buildProjectMetadataSummary, toIsoTimestamp } from "../utils/text";

interface CreateDraftInput {
  projectId: string;
  sessionId?: string;
  sourceLogId?: string;
  kind: MemoryDraft["kind"];
  title?: string;
  summary: string;
  details?: JsonRecord;
  tags?: string[];
  metadata?: JsonRecord;
  occurredAt?: Date | string;
}

function ensureSummary(summary: string): string {
  const trimmed = summary.trim();

  if (trimmed.length === 0) {
    throw new ConfigurationError("Memory summaries must be non-empty strings.");
  }

  return trimmed;
}

function createDraft(input: CreateDraftInput): MemoryDraft {
  const summary = ensureSummary(input.summary);
  const tags = normalizeTags(input.tags);
  const metadata = input.metadata ?? {};
  const title = input.title?.trim() || null;

  return {
    id: createId(),
    projectId: input.projectId,
    sourceLogId: input.sourceLogId ?? null,
    sessionId: input.sessionId ?? null,
    kind: input.kind,
    title,
    summary,
    details: input.details ?? {},
    tags,
    metadata,
    occurredAt: toIsoTimestamp(input.occurredAt),
    embeddingText: buildEmbeddingText({
      projectId: input.projectId,
      kind: input.kind,
      title,
      summary,
      tags,
      metadata
    })
  };
}

export function buildConversationMemoryDocuments(
  input: CaptureConversationInput,
  options: { sourceLogId?: string } = {}
): MemoryDraft[] {
  const memories: MemoryDraft[] = [];
  const baseTags = normalizeTags(input.tags);
  const occurredAt = toIsoTimestamp(input.occurredAt);

  if (input.prompt?.summary) {
    memories.push(
      createDraft({
        projectId: input.projectId,
        sessionId: input.sessionId,
        sourceLogId: options.sourceLogId,
        kind: "prompt_summary",
        title: "Prompt summary",
        summary: input.prompt.summary,
        details: {
          channel: "prompt",
          ...(input.prompt.metadata ? { segmentMetadata: input.prompt.metadata } : {})
        },
        tags: baseTags,
        metadata: input.metadata,
        occurredAt
      })
    );
  }

  if (input.response?.summary) {
    memories.push(
      createDraft({
        projectId: input.projectId,
        sessionId: input.sessionId,
        sourceLogId: options.sourceLogId,
        kind: "response_summary",
        title: "Response summary",
        summary: input.response.summary,
        details: {
          channel: "response",
          ...(input.response.metadata ? { segmentMetadata: input.response.metadata } : {})
        },
        tags: baseTags,
        metadata: input.metadata,
        occurredAt
      })
    );
  }

  if (input.analysis?.summary) {
    memories.push(
      createDraft({
        projectId: input.projectId,
        sessionId: input.sessionId,
        sourceLogId: options.sourceLogId,
        kind: "analysis_summary",
        title: "Analysis summary",
        summary: input.analysis.summary,
        details: {
          channel: "analysis",
          ...(input.analysis.metadata ? { segmentMetadata: input.analysis.metadata } : {})
        },
        tags: baseTags,
        metadata: input.metadata,
        occurredAt
      })
    );
  }

  for (const [index, decision] of (input.decisions ?? []).entries()) {
    if (decision.trim()) {
      memories.push(
        createDraft({
          projectId: input.projectId,
          sessionId: input.sessionId,
          sourceLogId: options.sourceLogId,
          kind: "decision",
          title: `Decision ${index + 1}`,
          summary: decision,
          details: {
            order: index + 1,
            source: "conversation"
          },
          tags: baseTags,
          metadata: input.metadata,
          occurredAt
        })
      );
    }
  }

  for (const [index, outcome] of (input.outcomes ?? []).entries()) {
    if (outcome.trim()) {
      memories.push(
        createDraft({
          projectId: input.projectId,
          sessionId: input.sessionId,
          sourceLogId: options.sourceLogId,
          kind: "outcome",
          title: `Outcome ${index + 1}`,
          summary: outcome,
          details: {
            order: index + 1,
            source: "conversation"
          },
          tags: baseTags,
          metadata: input.metadata,
          occurredAt
        })
      );
    }
  }

  if (input.project) {
    const summary = buildProjectMetadataSummary(input.project);

    if (summary) {
      memories.push(
        createDraft({
          projectId: input.projectId,
          sessionId: input.sessionId,
          sourceLogId: options.sourceLogId,
          kind: "project_metadata",
          title: "Project metadata snapshot",
          summary,
          details: {
            ...(input.project.name ? { name: input.project.name } : {}),
            ...(input.project.description ? { description: input.project.description } : {}),
            ...(input.project.metadata ? { metadata: input.project.metadata } : {}),
            ...(input.project.tags ? { tags: normalizeTags(input.project.tags) } : {})
          },
          tags: normalizeTags([...(input.project.tags ?? []), ...baseTags]),
          metadata: input.metadata,
          occurredAt
        })
      );
    }
  }

  return memories;
}

export function buildStandaloneMemoryDocument(input: RememberInput): MemoryDraft {
  return createDraft({
    projectId: input.projectId,
    sessionId: input.sessionId,
    sourceLogId: input.sourceLogId,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    details: input.details,
    tags: input.tags,
    metadata: input.metadata,
    occurredAt: input.occurredAt
  });
}
