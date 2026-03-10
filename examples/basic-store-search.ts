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
        Array.from({ length: 1536 }, (_, index) => (text.length + index) % 17 / 100)
      )
    );
  }

  embedQuery(text: string): Promise<number[]> {
    return Promise.resolve(
      Array.from({ length: 1536 }, (_, index) => (text.length + index) % 17 / 100)
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
    await memory.store({
      projectName: "billing-system",
      featureName: "subscription-renewal",
      taskType: "analysis",
      summary: "Renewal flow validates trial expiration before invoice generation.",
      decision: "Validate before invoice creation.",
      outcome: "Prevents invalid renewals.",
      tags: ["billing", "renewal", "validation"]
    });

    const results = await memory.search({
      query: "How did we handle renewal validation before invoice creation?",
      projectName: "billing-system",
      limit: 5
    });

    console.log(results);
  } finally {
    await memory.close();
  }
}

void main();
