import {
  BaseEmbeddingProvider,
  ProjectContextMemory
} from "@mahin1995/project-context-memory";

interface EmbeddingApiResponse {
  embeddings: number[][];
}

class HttpEmbeddingProvider extends BaseEmbeddingProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {
    super({
      model: "internal-embedding-model",
      dimensions: 1536
    });
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.requestEmbeddings(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.requestEmbeddings([text]);

    if (!embedding) {
      throw new Error("Embedding API did not return a query embedding.");
    }

    return embedding;
  }

  private async requestEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        inputs: texts
      })
    });

    if (!response.ok) {
      throw new Error(`Embedding API request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as EmbeddingApiResponse;

    if (!Array.isArray(payload.embeddings) || payload.embeddings.length !== texts.length) {
      throw new Error("Embedding API returned an unexpected response shape.");
    }

    return payload.embeddings;
  }
}

async function main(): Promise<void> {
  const postgresUrl = process.env.DATABASE_URL;
  const embeddingApiUrl = process.env.EMBEDDING_API_URL;
  const embeddingApiKey = process.env.EMBEDDING_API_KEY;

  if (!postgresUrl || !embeddingApiUrl || !embeddingApiKey) {
    throw new Error("Set DATABASE_URL, EMBEDDING_API_URL, and EMBEDDING_API_KEY first.");
  }

  const memory = new ProjectContextMemory({
    postgresUrl,
    embeddingProvider: new HttpEmbeddingProvider(embeddingApiUrl, embeddingApiKey)
  });

  try {
    await memory.store({
      projectName: "search-platform",
      featureName: "index-backfill",
      taskType: "decision",
      summary: "Backfill jobs must be throttled before nightly reindexing starts.",
      decision: "Throttle backfill workers to preserve reindex capacity.",
      tags: ["search", "backfill", "capacity"]
    });
  } finally {
    await memory.close();
  }
}

void main();
