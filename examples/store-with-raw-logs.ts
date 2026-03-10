import {
  BaseEmbeddingProvider,
  ProjectContextMemory
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
        Array.from({ length: 1536 }, (_, index) => (text.length + index) % 31 / 100)
      )
    );
  }

  embedQuery(text: string): Promise<number[]> {
    return Promise.resolve(
      Array.from({ length: 1536 }, (_, index) => (text.length + index) % 31 / 100)
    );
  }
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
    const result = await memory.store({
      projectName: "support-automation",
      featureName: "ticket-routing",
      taskType: "analysis",
      summary: "Priority routing now checks account tier before sending tickets to L2 support.",
      decision: "Read account tier before assigning escalation queues.",
      outcome: "Enterprise tickets reach the correct queue on the first pass.",
      tags: ["support", "routing", "priority"],
      filePaths: ["src/routing/ticket-priority.ts"],
      sourceThreadId: "support-routing-review",
      prompt: "Review how high-priority tickets are routed after the tiering update.",
      response: "The router reads account tier before deciding whether L2 escalation is required.",
      analysis: "Raw logs are stored separately from the summary memory entry."
    });

    console.log(result.entry);
    console.log(result.rawLog);
  } finally {
    await memory.close();
  }
}

void main();
