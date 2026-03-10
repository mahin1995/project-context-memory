import {
  BaseEmbeddingProvider,
  ProjectContextMemory
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
    const results = await memory.search({
      query: "How did we handle backfill capacity planning?",
      projectName: "search-platform",
      featureName: "index-backfill",
      taskType: "analysis",
      tags: ["capacity"],
      sourceThreadId: "backfill-review-thread",
      limit: 3
    });

    for (const result of results) {
      console.log(`${result.featureName}: ${result.summary} (${result.score.toFixed(3)})`);
    }
  } finally {
    await memory.close();
  }
}

void main();
