import {
  BaseEmbeddingProvider,
  ProjectContextMemory,
  retrieveRelevantMemories,
  saveInteractionAsMemory
} from "@mahin1995/project-context-memory";

class DemoEmbeddingProvider extends BaseEmbeddingProvider {
  constructor() {
    super({
      model: "text-embedding-3-small",
      dimensions: 1536
    });
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.resolve(
      texts.map((text) =>
        Array.from({ length: 1536 }, (_, index) => (text.length + index) % 23 / 100)
      )
    );
  }

  embedQuery(text: string): Promise<number[]> {
    return Promise.resolve(
      Array.from({ length: 1536 }, (_, index) => (text.length + index) % 23 / 100)
    );
  }
}

interface AgentState {
  projectName: string;
  featureName: string;
  threadId: string;
  question: string;
  answer?: string;
}

async function retrieveMemoryNode(
  state: AgentState,
  memory: ProjectContextMemory
): Promise<AgentState & { relevantMemories: Awaited<ReturnType<typeof retrieveRelevantMemories>> }> {
  const relevantMemories = await retrieveRelevantMemories(memory, {
    query: state.question,
    projectName: state.projectName,
    featureName: state.featureName,
    sourceThreadId: state.threadId,
    limit: 5
  });

  return {
    ...state,
    relevantMemories
  };
}

async function persistInteractionNode(
  state: AgentState,
  memory: ProjectContextMemory
): Promise<AgentState> {
  await saveInteractionAsMemory(memory, {
    projectName: state.projectName,
    featureName: state.featureName,
    taskType: "analysis",
    summary: `${state.question} -> ${state.answer ?? "No answer recorded yet."}`,
    sourceThreadId: state.threadId,
    prompt: state.question,
    response: state.answer,
    analysis: "Saved from a LangGraph-style workflow node."
  });

  return state;
}

async function main(): Promise<void> {
  const postgresUrl = process.env.DATABASE_URL;

  if (!postgresUrl) {
    throw new Error("Set DATABASE_URL before running this example.");
  }

  const memory = new ProjectContextMemory({
    postgresUrl,
    embeddingProvider: new DemoEmbeddingProvider()
  });

  try {
    const retrieved = await retrieveMemoryNode(
      {
        projectName: "search-platform",
        featureName: "index-backfill",
        threadId: "graph-thread-12",
        question: "Why do we throttle backfill workers before reindexing starts?",
        answer: "To keep enough capacity available for the nightly reindex."
      },
      memory
    );

    console.log(retrieved.relevantMemories);

    await persistInteractionNode(retrieved, memory);
  } finally {
    await memory.close();
  }
}

void main();
