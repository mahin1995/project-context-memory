import {
  BaseEmbeddingProvider,
  ProjectContextMemory,
  runMemoryBackedTurn
} from "@mahin14m/project-context-memory";

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
        Array.from({ length: 1536 }, (_, index) => (text.length + index) % 29 / 100)
      )
    );
  }

  embedQuery(text: string): Promise<number[]> {
    return Promise.resolve(
      Array.from({ length: 1536 }, (_, index) => (text.length + index) % 29 / 100)
    );
  }
}

interface AskWithMemoryArgs {
  projectName: string;
  featureName: string;
  threadId: string;
  question: string;
}

async function askWithMemory(memory: ProjectContextMemory, args: AskWithMemoryArgs) {
  return runMemoryBackedTurn(
    memory,
    {
      query: args.question,
      projectName: args.projectName,
      featureName: args.featureName,
      taskType: "analysis",
      sourceThreadId: args.threadId,
      tags: ["mcp", "assistant-turn"]
    },
    {
      // Replace this with your actual LLM call in an MCP tool handler.
      generate: ({ prompt, memoryContext, memories }) => {
        const response =
          memories.length > 0
            ? "I used prior project memory to answer this question."
            : "I answered without prior matching project memory.";

        return Promise.resolve({
          response,
          summary: `Answered: ${args.question}`,
          decision: memories.length > 0 ? "Ground answer using retrieved memory." : undefined,
          outcome: "Persisted this turn for future retrieval.",
          analysis: `Prompt length=${prompt.length}, memory context length=${memoryContext.length}`
        });
      }
    }
  );
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
    const result = await askWithMemory(memory, {
      projectName: "billing-system",
      featureName: "subscription-renewal",
      threadId: "mcp-thread-1",
      question: "How did we prevent invalid renewals before invoicing?"
    });

    console.log("Prompt sent to model:\n", result.prompt);
    console.log("Retrieved memories:", result.memories);
    console.log("Model response:", result.generated.response);
    console.log("Stored entry:", result.writeResult.entry);
  } finally {
    await memory.close();
  }
}

void main();
