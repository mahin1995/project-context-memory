import { ConfigurationError } from "../core/errors";
import { memorySearchInputSchema } from "../memory/schemas";
import type {
  MemorySearchInput,
  MemorySearchResult,
  ValidatedMemorySearchInput
} from "../types/memory";
import type { EmbeddingProvider } from "../embeddings/provider";
import type { PostgresMemoryStore } from "../db/postgres-project-context-store";
import { normalizeTags } from "../utils/tags";
import { normalizeOptionalText, normalizeWhitespace } from "../utils/text";
import { assertVectorDimensions } from "../utils/vector";

function normalizeSearchInput(input: MemorySearchInput): ValidatedMemorySearchInput {
  const parsed = memorySearchInputSchema.parse(input);

  return {
    query: normalizeWhitespace(parsed.query),
    projectName: normalizeOptionalText(parsed.projectName),
    featureName: normalizeOptionalText(parsed.featureName),
    taskType: normalizeOptionalText(parsed.taskType),
    tags: normalizeTags(parsed.tags),
    sourceThreadId: normalizeOptionalText(parsed.sourceThreadId),
    limit: parsed.limit ?? 5,
    minScore: parsed.minScore ?? null
  };
}

export class MemoryRetriever {
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

  async search(input: MemorySearchInput): Promise<MemorySearchResult[]> {
    const normalized = normalizeSearchInput(input);
    const embedding = await this.embeddingProvider.embedQuery(normalized.query);

    if (!embedding) {
      throw new ConfigurationError("Embedding provider did not return a query embedding.");
    }

    return this.store.searchMemoryEntries({
      embedding: assertVectorDimensions(embedding, this.embeddingDimensions),
      filters: normalized
    });
  }
}

export { normalizeSearchInput };
