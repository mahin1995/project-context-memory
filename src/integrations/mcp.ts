import type {
  MemorySearchInput,
  MemorySearchResult,
  MemoryWriteResult,
  StoreMemoryInput
} from "../types/memory";

export interface MemoryEngineClient {
  search(input: MemorySearchInput): Promise<MemorySearchResult[]>;
  store(input: StoreMemoryInput): Promise<MemoryWriteResult>;
}

export interface RunMemoryBackedTurnInput {
  query: string;
  projectName: string;
  featureName: string;
  taskType: string;
  sourceThreadId?: string;
  tags?: string[];
  filePaths?: string[];
  limit?: number;
  minScore?: number;
}

export interface GenerateWithMemoryInput {
  query: string;
  prompt: string;
  memoryContext: string;
  memories: MemorySearchResult[];
}

export interface GenerateWithMemoryOutput {
  response: string;
  summary?: string;
  decision?: string;
  outcome?: string;
  analysis?: string;
}

export interface RunMemoryBackedTurnOptions {
  retrieval?: {
    limit?: number;
    minScore?: number;
  };
  buildPrompt?: (input: GenerateWithMemoryInput) => string | Promise<string>;
  generate: (input: GenerateWithMemoryInput) => Promise<GenerateWithMemoryOutput>;
  includeComposedPromptInRawLog?: boolean;
}

export interface RunMemoryBackedTurnResult {
  prompt: string;
  memoryContext: string;
  memories: MemorySearchResult[];
  generated: GenerateWithMemoryOutput;
  writeResult: MemoryWriteResult;
}

function buildMemoryContext(memories: MemorySearchResult[]): string {
  if (memories.length === 0) {
    return "No relevant memory entries were found.";
  }

  return memories
    .map(
      (memory, index) =>
        `${index + 1}. [${memory.taskType}] ${memory.summary} (score=${memory.score.toFixed(4)})`
    )
    .join("\n");
}

function buildDefaultPrompt(input: GenerateWithMemoryInput): string {
  return [
    "You have access to long-term project memory.",
    "Use the relevant memories below when they help answer the user.",
    "",
    "Relevant memories:",
    input.memoryContext,
    "",
    "User question:",
    input.query
  ].join("\n");
}

function normalizeSummary(summary: string): string {
  return summary.trim().replace(/\s+/g, " ");
}

function buildFallbackSummary(query: string, response: string): string {
  const q = normalizeSummary(query);
  const r = normalizeSummary(response);

  if (r.length === 0) {
    return `Handled user query: ${q}`;
  }

  const joined = `Q: ${q} | A: ${r}`;
  return joined.length > 500 ? `${joined.slice(0, 497)}...` : joined;
}

export async function runMemoryBackedTurn(
  client: MemoryEngineClient,
  input: RunMemoryBackedTurnInput,
  options: RunMemoryBackedTurnOptions
): Promise<RunMemoryBackedTurnResult> {
  const memories = await client.search({
    query: input.query,
    projectName: input.projectName,
    featureName: input.featureName,
    taskType: input.taskType,
    sourceThreadId: input.sourceThreadId,
    tags: input.tags,
    limit: options.retrieval?.limit ?? input.limit ?? 5,
    minScore: options.retrieval?.minScore ?? input.minScore
  });

  const memoryContext = buildMemoryContext(memories);
  const generationInput: GenerateWithMemoryInput = {
    query: input.query,
    prompt: "",
    memoryContext,
    memories
  };
  const prompt = options.buildPrompt
    ? await options.buildPrompt(generationInput)
    : buildDefaultPrompt(generationInput);

  const generated = await options.generate({
    ...generationInput,
    prompt
  });

  const summary = generated.summary
    ? normalizeSummary(generated.summary)
    : buildFallbackSummary(input.query, generated.response);

  const writeResult = await client.store({
    projectName: input.projectName,
    featureName: input.featureName,
    taskType: input.taskType,
    summary,
    decision: generated.decision,
    outcome: generated.outcome,
    tags: input.tags,
    filePaths: input.filePaths,
    sourceThreadId: input.sourceThreadId,
    prompt: options.includeComposedPromptInRawLog === false ? input.query : prompt,
    response: generated.response,
    analysis: generated.analysis
  });

  return {
    prompt,
    memoryContext,
    memories,
    generated,
    writeResult
  };
}
