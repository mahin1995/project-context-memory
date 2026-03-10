import { ConfigurationError } from "../core/errors";
import { storeMemoryInputSchema } from "./schemas";
import type {
  MemoryWriteResult,
  StoreMemoryInput,
  UpsertMemoryEntryInput,
  ValidatedStoreMemoryInput
} from "../types/memory";
import type { EmbeddingProvider } from "../embeddings/provider";
import type { PostgresMemoryStore } from "../db/postgres-project-context-store";
import { normalizeTags } from "../utils/tags";
import { normalizeOptionalText, normalizeStringList, normalizeWhitespace } from "../utils/text";
import { assertVectorDimensions } from "../utils/vector";

function normalizeStoreMemoryInput(input: StoreMemoryInput): ValidatedStoreMemoryInput {
  const parsed = storeMemoryInputSchema.parse(input);

  return {
    projectName: normalizeWhitespace(parsed.projectName),
    featureName: normalizeWhitespace(parsed.featureName),
    taskType: normalizeWhitespace(parsed.taskType),
    summary: normalizeWhitespace(parsed.summary),
    decision: normalizeOptionalText(parsed.decision),
    outcome: normalizeOptionalText(parsed.outcome),
    tags: normalizeTags(parsed.tags),
    filePaths: normalizeStringList(parsed.filePaths),
    sourceThreadId: normalizeOptionalText(parsed.sourceThreadId),
    prompt: normalizeOptionalText(parsed.prompt),
    response: normalizeOptionalText(parsed.response),
    analysis: normalizeOptionalText(parsed.analysis)
  };
}

function hasRawLog(input: ValidatedStoreMemoryInput): boolean {
  return Boolean(input.prompt || input.response || input.analysis);
}

export class MemoryWriter {
  private readonly store: PostgresMemoryStore;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly embeddingDimensions: number;

  constructor(options: {
    store: PostgresMemoryStore;
    embeddingProvider: EmbeddingProvider;
    embeddingDimensions: number;
  }) {
    this.store = options.store;
    this.embeddingProvider = options.embeddingProvider;
    this.embeddingDimensions = options.embeddingDimensions;
  }

  async write(input: StoreMemoryInput): Promise<MemoryWriteResult> {
    const normalized = normalizeStoreMemoryInput(input);
    const vectors = await this.embeddingProvider.embedDocuments([normalized.summary]);
    const embedding = vectors[0];

    if (!embedding) {
      throw new ConfigurationError("Embedding provider did not return a summary embedding.");
    }

    const entryInput: UpsertMemoryEntryInput = {
      projectName: normalized.projectName,
      featureName: normalized.featureName,
      taskType: normalized.taskType,
      summary: normalized.summary,
      decision: normalized.decision,
      outcome: normalized.outcome,
      tags: normalized.tags,
      filePaths: normalized.filePaths,
      sourceThreadId: normalized.sourceThreadId,
      embedding: assertVectorDimensions(embedding, this.embeddingDimensions)
    };

    return this.store.withTransaction(async (client) => {
      const entry = await this.store.upsertMemoryEntry(entryInput, client);
      const rawLog = hasRawLog(normalized)
        ? await this.store.insertRawLog(
            {
              memoryEntryId: entry.id,
              prompt: normalized.prompt,
              response: normalized.response,
              analysis: normalized.analysis
            },
            client
          )
        : null;

      return {
        entry,
        rawLog
      };
    });
  }
}

export { normalizeStoreMemoryInput };
