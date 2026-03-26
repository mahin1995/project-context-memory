import { ConfigurationError } from "./errors";
import { MemoryWriter } from "../memory/memory-writer";
import { MemoryRetriever } from "../retrieval/memory-retriever";
import { PostgresMemoryStore } from "../db/postgres-project-context-store";
import type {
  CaptureConversationInput,
  CaptureConversationResult,
  MemoryEntryRecord,
  MemoryRecord,
  MemorySearchInput,
  MemorySearchResult,
  MemoryWriteResult,
  RawLogRecord,
  RememberInput,
  RetrieveContextInput,
  RetrievedContext,
  RetrievedMemory,
  StoreMemoryInput
} from "../types/memory";
import type {
  EmbeddingConfig,
  ProjectContextMemoryOptions,
  ProjectProfile,
  UpsertProjectProfileInput
} from "../types/project";
import { normalizeTags } from "../utils/tags";
import { normalizeOptionalText } from "../utils/text";

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_MODEL_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536
};

function resolveEmbeddingDimensions(
  provider: ProjectContextMemoryOptions["embeddingProvider"],
  config?: EmbeddingConfig
): number {
  const model = config?.model ?? provider.model ?? DEFAULT_MODEL;
  const dimensions =
    config?.dimensions ?? provider.dimensions ?? DEFAULT_MODEL_DIMENSIONS[model] ?? 1536;

  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new ConfigurationError("Resolved embedding dimensions must be a positive integer.");
  }

  return dimensions;
}

function mapTaskTypeToMemoryKind(taskType: string): MemoryRecord["kind"] {
  switch (taskType) {
    case "prompt_summary":
    case "response_summary":
    case "analysis_summary":
    case "decision":
    case "outcome":
    case "project_metadata":
      return taskType;
    default:
      return "note";
  }
}

function toLegacyMemoryRecord(result: MemorySearchResult): RetrievedMemory {
  return {
    id: result.id,
    projectId: result.projectName,
    sourceLogId: null,
    sessionId: result.sourceThreadId,
    kind: mapTaskTypeToMemoryKind(result.taskType),
    title: result.featureName,
    summary: result.summary,
    details: {
      decision: result.decision,
      outcome: result.outcome,
      filePaths: result.filePaths,
      taskType: result.taskType
    },
    tags: result.tags,
    metadata: {},
    occurredAt: result.createdAt,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    score: result.score
  };
}

function toMemoryRecord(result: MemoryWriteResult["entry"]): MemoryRecord {
  return {
    id: result.id,
    projectId: result.projectName,
    sourceLogId: null,
    sessionId: result.sourceThreadId,
    kind: mapTaskTypeToMemoryKind(result.taskType),
    title: result.featureName,
    summary: result.summary,
    details: {
      decision: result.decision,
      outcome: result.outcome,
      filePaths: result.filePaths,
      taskType: result.taskType
    },
    tags: result.tags,
    metadata: {},
    occurredAt: result.createdAt,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt
  };
}

function toRawLogRecord(result: MemoryWriteResult["rawLog"], projectName: string): RawLogRecord {
  return {
    id: result?.id ?? "",
    projectId: projectName,
    sessionId: null,
    promptText: result?.prompt ?? null,
    promptSummary: result?.prompt ?? null,
    responseText: result?.response ?? null,
    responseSummary: result?.response ?? null,
    analysisText: result?.analysis ?? null,
    analysisSummary: result?.analysis ?? null,
    tags: [],
    metadata: {},
    occurredAt: result?.createdAt ?? new Date().toISOString(),
    createdAt: result?.createdAt ?? new Date().toISOString()
  };
}

function buildContextText(results: MemorySearchResult[]): string {
  if (results.length === 0) {
    return "No matching memory entries were found.";
  }

  return results
    .map(
      (result, index) =>
        `${index + 1}. [${result.taskType}] ${result.summary} | score=${result.score.toFixed(4)}`
    )
    .join("\n");
}

export class ProjectContextMemory {
  private readonly embeddingDimensions: number;
  private readonly memoryStore: PostgresMemoryStore;
  private readonly writer: MemoryWriter;
  private readonly retriever: MemoryRetriever;
  private readonly projectProfiles = new Map<string, ProjectProfile>();
  private setupPromise: Promise<void> | null = null;

  constructor(options: ProjectContextMemoryOptions) {
    if (!options.embeddingProvider) {
      throw new ConfigurationError("An embedding provider is required.");
    }

    this.embeddingDimensions = resolveEmbeddingDimensions(
      options.embeddingProvider,
      options.embedding
    );
    this.memoryStore = new PostgresMemoryStore({
      ...options,
      embeddingDimensions: this.embeddingDimensions
    });
    this.writer = new MemoryWriter({
      store: this.memoryStore,
      embeddingProvider: options.embeddingProvider,
      embeddingDimensions: this.embeddingDimensions
    });
    this.retriever = new MemoryRetriever({
      store: this.memoryStore,
      embeddingProvider: options.embeddingProvider,
      embeddingDimensions: this.embeddingDimensions
    });
  }

  async setup(): Promise<this> {
    await this.ensureInitialized();
    return this;
  }

  async initialize(): Promise<this> {
    return this.setup();
  }

  async close(): Promise<void> {
    await this.memoryStore.close();
  }

  async store(input: StoreMemoryInput): Promise<MemoryWriteResult> {
    await this.ensureInitialized();
    return this.writer.write(input);
  }

  async search(input: MemorySearchInput): Promise<MemorySearchResult[]> {
    await this.ensureInitialized();
    return this.retriever.search(input);
  }

  async getById(id: string): Promise<MemoryEntryRecord | null> {
    const normalizedId = normalizeOptionalText(id);

    if (!normalizedId) {
      throw new ConfigurationError("A memory entry id is required.");
    }

    await this.ensureInitialized();
    return this.memoryStore.getMemoryEntryById(normalizedId);
  }

  /** @deprecated Use store() instead. */
  async remember(input: RememberInput): Promise<MemoryRecord[]> {
    const result = await this.store({
      projectName: input.projectId,
      featureName: normalizeOptionalText(input.title) ?? input.sourceLogId ?? input.sessionId ?? "general",
      taskType: input.kind,
      summary: input.summary,
      decision: input.kind === "decision" ? input.summary : undefined,
      outcome: input.kind === "outcome" ? input.summary : undefined,
      tags: input.tags,
      filePaths: Array.isArray(input.details?.filePaths)
        ? input.details.filePaths.filter((value): value is string => typeof value === "string")
        : undefined,
      sourceThreadId: input.sessionId ?? input.sourceLogId
    });

    return [toMemoryRecord(result.entry)];
  }

  /** @deprecated Use search() instead. */
  async retrieve(input: RetrieveContextInput): Promise<RetrievedContext> {
    const results = await this.search({
      query: input.query,
      projectName: input.projectId,
      taskType: input.memoryKinds?.length === 1 ? input.memoryKinds[0] : undefined,
      tags: input.tags,
      sourceThreadId: input.sessionId,
      limit: input.limit,
      minScore: input.minScore
    });
    const memories = results.map(toLegacyMemoryRecord);
    const project =
      this.projectProfiles.get(input.projectId) ??
      (results[0]
        ? {
            projectId: results[0].projectName,
            name: null,
            description: null,
            tags: [],
            metadata: {},
            createdAt: results[0].createdAt,
            updatedAt: results[0].updatedAt
          }
        : null);

    return {
      projectId: input.projectId,
      query: input.query,
      retrievedAt: new Date().toISOString(),
      project,
      memories,
      rawLogs: [],
      contextText: buildContextText(results)
    };
  }

  /** @deprecated Use store() instead. */
  async captureConversation(input: CaptureConversationInput): Promise<CaptureConversationResult> {
    const summary =
      input.analysis?.summary ??
      input.response?.summary ??
      input.prompt?.summary ??
      input.analysis?.raw ??
      input.response?.raw ??
      input.prompt?.raw;

    if (!summary) {
      throw new ConfigurationError("captureConversation requires at least one prompt/response/analysis summary or raw value.");
    }

    const writeResult = await this.store({
      projectName: input.projectId,
      featureName: input.project?.name ?? input.sessionId ?? "general",
      taskType: input.analysis ? "analysis" : "conversation",
      summary,
      decision: input.decisions?.join(" | "),
      outcome: input.outcomes?.join(" | "),
      tags: normalizeTags([...(input.tags ?? []), ...(input.project?.tags ?? [])]),
      sourceThreadId: input.sessionId,
      prompt: input.prompt?.raw ?? input.prompt?.summary,
      response: input.response?.raw ?? input.response?.summary,
      analysis: input.analysis?.raw ?? input.analysis?.summary
    });

    if (input.project) {
      this.projectProfiles.set(input.projectId, {
        projectId: input.projectId,
        name: input.project.name ?? null,
        description: input.project.description ?? null,
        tags: normalizeTags([...(input.project.tags ?? []), ...(input.tags ?? [])]),
        metadata: input.project.metadata ?? {},
        createdAt: writeResult.entry.createdAt,
        updatedAt: writeResult.entry.updatedAt
      });
    }

    return {
      project: this.projectProfiles.get(input.projectId) ?? null,
      rawLog: toRawLogRecord(writeResult.rawLog, input.projectId),
      memories: [toMemoryRecord(writeResult.entry)]
    };
  }

  /** @deprecated Project profiles are only kept in-memory for compatibility. */
  upsertProjectProfile(input: UpsertProjectProfileInput): Promise<ProjectProfile> {
    const now = new Date().toISOString();
    const profile: ProjectProfile = {
      projectId: input.projectId.trim(),
      name: normalizeOptionalText(input.name),
      description: normalizeOptionalText(input.description),
      tags: normalizeTags(input.tags),
      metadata: input.metadata ?? {},
      createdAt: this.projectProfiles.get(input.projectId)?.createdAt ?? now,
      updatedAt: now
    };
    this.projectProfiles.set(profile.projectId, profile);
    return Promise.resolve(profile);
  }

  /** @deprecated Project profiles are only kept in-memory for compatibility. */
  getProjectProfile(projectId: string): Promise<ProjectProfile | null> {
    return Promise.resolve(this.projectProfiles.get(projectId.trim()) ?? null);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.setupPromise) {
      this.setupPromise = this.memoryStore.setup();
    }

    await this.setupPromise;
  }
}

export async function createProjectContextMemory(
  options: ProjectContextMemoryOptions
): Promise<ProjectContextMemory> {
  const memory = new ProjectContextMemory(options);
  return memory.setup();
}


