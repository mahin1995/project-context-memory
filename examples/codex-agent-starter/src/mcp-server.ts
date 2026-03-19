import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ProjectContextMemory, runMemoryBackedTurn } from "@mahin14m/project-context-memory";
import { DemoEmbeddingProvider } from "./demo-embedding-provider";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

function loadDotEnv(): void {
  const currentFilePath = fileURLToPath(import.meta.url);
  const exampleRoot = resolve(dirname(currentFilePath), "..");
  const envPath = resolve(exampleRoot, ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const envContent = readFileSync(envPath, "utf8");

  for (const line of envContent.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Set ${name} before running the MCP example. You can copy .env.example to .env in examples/codex-agent-starter.`
    );
  }

  return value;
}

function formatMemoryList(memorySummaries: string[]): string {
  if (memorySummaries.length === 0) {
    return "No matching memories were found.";
  }

  return memorySummaries.map((line, index) => `${index + 1}. ${line}`).join("\n");
}

function formatSearchResults(
  results: Array<{
    taskType: string;
    summary: string;
    score: number;
  }>
): string {
  if (results.length === 0) {
    return "No matching memories were found.";
  }

  return results
    .map(
      (item, index) =>
        `${index + 1}. [${item.taskType}] score=${item.score.toFixed(4)} | ${item.summary}`
    )
    .join("\n");
}

async function generateWithOpenAIOrFallback(input: {
  question: string;
  prompt: string;
  memoryCount: number;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  if (!apiKey) {
    return [
      `Question: ${input.question}`,
      "",
      "Memory-backed answer (fallback mode):",
      input.memoryCount > 0
        ? `Found ${input.memoryCount} prior memory entries. Set OPENAI_API_KEY to use a real model.`
        : "No prior memory entries matched. Set OPENAI_API_KEY to use a real model."
    ].join("\n");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a concise engineering assistant. Use provided project memory context when relevant and avoid hallucinating facts."
        },
        {
          role: "user",
          content: input.prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${failureText}`);
  }

  const payload = (await response.json()) as OpenAIChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenAI returned an empty completion.");
  }

  return content;
}

async function main(): Promise<void> {
  loadDotEnv();

  const memory = await new ProjectContextMemory({
    postgresUrl: getRequiredEnv("DATABASE_URL"),
    embeddingProvider: new DemoEmbeddingProvider(),
    embedding: {
      model: "local-demo-provider",
      dimensions: 256
    }
  }).setup();

  const server = new McpServer(
    {
      name: "project-context-memory-example",
      version: "0.1.0"
    },
    {
      capabilities: {
        logging: {}
      }
    }
  );

  server.registerTool(
    "ask_with_memory",
    {
      description: "Retrieve project memory, answer a question, and persist the interaction.",
      inputSchema: {
        question: z.string().trim().min(1),
        projectName: z.string().trim().min(1).optional(),
        featureName: z.string().trim().min(1).optional(),
        threadId: z.string().trim().min(1).optional(),
        taskType: z.string().trim().min(1).optional(),
        tags: z.array(z.string().trim().min(1)).max(25).optional(),
        minScore: z.number().min(0).max(1).optional(),
        limit: z.number().int().positive().max(20).optional()
      }
    },
    async ({ question, projectName, featureName, threadId, taskType, tags, minScore, limit }) => {
      const result = await runMemoryBackedTurn(
        memory,
        {
          query: question,
          projectName: projectName ?? process.env.PROJECT_NAME ?? "default-project",
          featureName: featureName ?? process.env.FEATURE_NAME ?? "general",
          taskType: taskType ?? "analysis",
          sourceThreadId: threadId ?? process.env.CODEX_THREAD_ID,
          tags,
          minScore,
          limit
        },
        {
          generate: async ({ query, memories, prompt }) => {
            const memorySummaries = memories.map((item) => item.summary);
            const response = await generateWithOpenAIOrFallback({
              question: query,
              prompt,
              memoryCount: memories.length
            });

            return {
              response,
              summary: `Answered with memory-backed MCP tool: ${query}`,
              decision:
                memories.length > 0 ? "Ground response in retrieved project memory." : undefined,
              outcome: "Persisted MCP tool interaction for future retrieval.",
              analysis: formatMemoryList(memorySummaries)
            };
          }
        }
      );

      return {
        content: [
          {
            type: "text",
            text: [
              result.generated.response,
              "",
              "Retrieved memory summaries:",
              formatMemoryList(result.memories.map((item) => item.summary)),
              "",
              `Stored memory entry: ${result.writeResult.entry.id}`
            ].join("\n")
          }
        ]
      };
    }
  );

  server.registerTool(
    "search_project_memory",
    {
      description: "Search project memory without generating a model answer.",
      inputSchema: {
        query: z.string().trim().min(1),
        projectName: z.string().trim().min(1).optional(),
        featureName: z.string().trim().min(1).optional(),
        threadId: z.string().trim().min(1).optional(),
        taskType: z.string().trim().min(1).optional(),
        tags: z.array(z.string().trim().min(1)).max(25).optional(),
        minScore: z.number().min(0).max(1).optional(),
        limit: z.number().int().positive().max(20).optional()
      }
    },
    async ({ query, projectName, featureName, threadId, taskType, tags, minScore, limit }) => {
      const results = await memory.search({
        query,
        projectName: projectName ?? process.env.PROJECT_NAME ?? "default-project",
        featureName: featureName ?? process.env.FEATURE_NAME ?? "general",
        sourceThreadId: threadId ?? process.env.CODEX_THREAD_ID,
        taskType,
        tags,
        minScore,
        limit: limit ?? 5
      });

      return {
        content: [
          {
            type: "text",
            text: formatSearchResults(results)
          }
        ]
      };
    }
  );

  server.registerTool(
    "store_conversation",
    {
      description: "Store an entire conversation or chat history as project memory entries.",
      inputSchema: {
        conversation: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1)
          })
        ).min(1),
        projectName: z.string().trim().min(1).optional(),
        featureName: z.string().trim().min(1).optional(),
        threadId: z.string().trim().min(1).optional(),
        taskType: z.string().trim().min(1).optional(),
        tags: z.array(z.string().trim().min(1)).max(25).optional(),
        conversationTitle: z.string().trim().min(1).optional()
      }
    },
    async ({ conversation, projectName, featureName, threadId, taskType, tags, conversationTitle }) => {
      const projectName_ = projectName ?? process.env.PROJECT_NAME ?? "default-project";
      const featureName_ = featureName ?? process.env.FEATURE_NAME ?? "general";
      const taskType_ = taskType ?? "conversation";

      // Build a summary of the conversation
      const userMessages = conversation.filter((msg) => msg.role === "user");
      const assistantMessages = conversation.filter((msg) => msg.role === "assistant");

      const summary =
        conversationTitle ||
        `Conversation with ${userMessages.length} questions and ${assistantMessages.length} answers`;

      // Store conversation as a memory entry
      const result = await memory.store({
        projectName: projectName_,
        featureName: featureName_,
        taskType: taskType_,
        summary,
        prompt: conversation
          .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
          .join("\n\n"),
        response: summary,
        sourceThreadId: threadId,
        tags: tags ?? ["conversation"]
      });

      // const storedIds = result.entry.id ? [result.entry.id] : [];

      return {
        content: [
          {
            type: "text",
            text: [
              `✓ Stored conversation as memory entry`,
              `Entry ID: ${result.entry.id}`,
              `Project: ${projectName_}`,
              `Feature: ${featureName_}`,
              `Messages: ${userMessages.length} user, ${assistantMessages.length} assistant`,
              `Summary: ${summary}`,
              "",
              "This conversation is now searchable via ask_with_memory and search_project_memory tools."
            ].join("\n")
          }
        ]
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async (): Promise<void> => {
    await server.close();
    await memory.close();
  };

  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
