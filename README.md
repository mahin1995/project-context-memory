# @mahin1995/project-context-memory

Long-term project memory for AI agents with PostgreSQL as the source of truth and pgvector for semantic retrieval.

The package is library-first. Summaries are the main retrieval unit. Raw prompt, response, and analysis logs are stored separately so you can keep provenance without polluting semantic search.

## Installation

```bash
npm install @mahin1995/project-context-memory
```

## Quick Start

```ts
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

const memory = new ProjectContextMemory({
  postgresUrl: process.env.DATABASE_URL!,
  embeddingProvider: new DemoEmbeddingProvider()
});

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

await memory.close();
```

## PostgreSQL Setup

Create a PostgreSQL database and make sure the application user can create extensions and tables in the target schema.

```sql
CREATE DATABASE project_memory;
```

Use `DATABASE_URL` in standard PostgreSQL form:

```bash
export DATABASE_URL="postgres://app_user:app_password@localhost:5432/project_memory"
```

## pgvector Setup

The package enables pgvector during `setup()`, but PostgreSQL must have the extension available.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

On first use, the library creates:

- `memory_entries`
- `memory_raw_logs`
- metadata tables needed to track embedding dimensions safely

It also adds indexes for `project_name`, `feature_name`, `task_type`, `created_at`, `source_thread_id`, tag overlap, and raw-log lookup.

## Public API

### `ProjectContextMemory`

Main entrypoint for npm consumers.

```ts
new ProjectContextMemory({
  postgresUrl,
  embeddingProvider,
  embedding: {
    model: "text-embedding-3-small",
    dimensions: 1536
  },
  schemaName: "public",
  autoMigrate: true
});
```

Primary methods:

- `store(input)` stores a summary memory and optional raw logs
- `search(input)` retrieves the top ranked summary memories
- `setup()` initializes the schema eagerly
- `close()` closes the owned `pg` pool

### `BaseEmbeddingProvider`

Extend `BaseEmbeddingProvider` to plug in your own embedding backend.

```ts
import { BaseEmbeddingProvider } from "@mahin1995/project-context-memory";

class MyEmbeddingProvider extends BaseEmbeddingProvider {
  constructor() {
    super({
      model: "internal-embedding-model",
      dimensions: 1536
    });
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map(() => Array.from({ length: 1536 }, () => 0.01)));
  }

  embedQuery(text: string): Promise<number[]> {
    return Promise.resolve(Array.from({ length: 1536 }, () => text.length / 1000));
  }
}
```

### `MemoryRetriever`

`search()` uses pgvector similarity and supports:

- `projectName`
- `featureName`
- `taskType`
- `tags`
- `sourceThreadId`
- `limit`
- `minScore`

Ranking combines:

- vector similarity
- exact project boost
- exact feature boost
- exact task-type boost
- recency boost from `updated_at`

## Memory Model

### `memory_entries`

Primary semantic retrieval table:

- `id`
- `project_name`
- `feature_name`
- `task_type`
- `summary`
- `decision`
- `outcome`
- `tags`
- `file_paths`
- `source_thread_id`
- `created_at`
- `updated_at`
- `embedding`

### `memory_raw_logs`

Secondary raw interaction table:

- `id`
- `memory_entry_id`
- `prompt`
- `response`
- `analysis`
- `created_at`

## Raw Logs and Summaries

- `summary` is the canonical retrieval text and the only field embedded by default
- raw logs are stored separately in `memory_raw_logs`
- duplicate memories are merged by normalized `project_name + feature_name + task_type + summary`

## Vector Index Guidance

For larger datasets, add an approximate vector index after the table has enough rows:

```sql
CREATE INDEX IF NOT EXISTS memory_entries_embedding_ivfflat_idx
ON public.memory_entries
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

ANALYZE public.memory_entries;
```

For read-heavy workloads on newer pgvector versions, consider `hnsw` with `vector_cosine_ops`.

## LangGraph Example

The package does not depend on LangGraph directly. Use the helpers inside your node functions.

```ts
import {
  ProjectContextMemory,
  retrieveRelevantMemories,
  saveInteractionAsMemory
} from "@mahin1995/project-context-memory";

async function retrieveMemoryNode(state: {
  question: string;
  projectName: string;
  featureName: string;
  threadId: string;
}, memory: ProjectContextMemory) {
  const memories = await retrieveRelevantMemories(memory, {
    query: state.question,
    projectName: state.projectName,
    featureName: state.featureName,
    sourceThreadId: state.threadId,
    limit: 5
  });

  return {
    ...state,
    memories
  };
}

async function persistInteractionNode(state: {
  question: string;
  answer: string;
  projectName: string;
  featureName: string;
  threadId: string;
}, memory: ProjectContextMemory) {
  await saveInteractionAsMemory(memory, {
    projectName: state.projectName,
    featureName: state.featureName,
    taskType: "analysis",
    summary: `${state.question} -> ${state.answer}`,
    sourceThreadId: state.threadId,
    prompt: state.question,
    response: state.answer
  });

  return state;
}
```

## Examples

Consumer-facing examples live in [`examples/`](./examples):

- `basic-store-search.ts`
- `custom-embedding-provider.ts`
- `langgraph-integration.ts`
- `project-scoped-retrieval.ts`
- `store-with-raw-logs.ts`

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Publish Checklist

```bash
npm run clean
npm run typecheck
npm run lint
npm test
npm run build
npm pack --dry-run
```

Check that the tarball only contains built output plus `README.md` and `LICENSE`.

## License

MIT
