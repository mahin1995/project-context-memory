import type { RetrievedContext } from "../types/memory";
import { buildContextString } from "./context-retriever";

export interface LangGraphStatePatchOptions {
  stateKey?: string;
}

export interface LangGraphMemoryState {
  projectId: string;
  query: string;
  retrievedAt: string;
  contextText: string;
  memories: RetrievedContext["memories"];
  rawLogs: RetrievedContext["rawLogs"];
  project: RetrievedContext["project"];
}

export function buildLangGraphStatePatch(
  context: RetrievedContext,
  options: LangGraphStatePatchOptions = {}
): Record<string, LangGraphMemoryState> {
  const stateKey = options.stateKey ?? "projectMemory";
  const contextText = context.contextText || buildContextString(context);

  return {
    [stateKey]: {
      projectId: context.projectId,
      query: context.query,
      retrievedAt: context.retrievedAt,
      contextText,
      memories: context.memories,
      rawLogs: context.rawLogs,
      project: context.project
    }
  };
}
