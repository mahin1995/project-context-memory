import type {
  MemorySearchInput,
  MemorySearchResult,
  MemoryWriteResult,
  StoreMemoryInput
} from "../types/memory";
export {
  buildLangGraphStatePatch,
  type LangGraphMemoryState,
  type LangGraphStatePatchOptions
} from "../retrieval/langgraph";

export interface MemorySearchClient {
  search(input: MemorySearchInput): Promise<MemorySearchResult[]>;
}

export interface MemoryStoreClient {
  store(input: StoreMemoryInput): Promise<MemoryWriteResult>;
}

export async function retrieveRelevantMemories(
  client: MemorySearchClient,
  input: MemorySearchInput
): Promise<MemorySearchResult[]> {
  return client.search(input);
}

export async function saveInteractionAsMemory(
  client: MemoryStoreClient,
  input: StoreMemoryInput
): Promise<MemoryWriteResult> {
  return client.store(input);
}
