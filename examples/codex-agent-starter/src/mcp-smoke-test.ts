import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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

function getOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function toStringEnv(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function getTextBlocks(result: unknown): string {
  if (
    typeof result !== "object" ||
    result === null ||
    !("content" in result) ||
    !Array.isArray((result as { content?: unknown }).content)
  ) {
    return "(no text content)";
  }

  const content = (result as { content: Array<{ type?: string; text?: string }> }).content;
  const textParts = content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string);

  return textParts.length > 0 ? textParts.join("\n\n") : "(no text content)";
}

async function main(): Promise<void> {
  loadDotEnv();

  const projectName = getOption("--project") ?? process.env.PROJECT_NAME ?? "default-project";
  const featureName = getOption("--feature") ?? process.env.FEATURE_NAME ?? "general";
  const threadId = getOption("--thread") ?? process.env.CODEX_THREAD_ID ?? "smoke-test-thread";
  const query =
    getOption("--query") ?? "How did we validate subscription renewals before invoicing?";
  const question =
    getOption("--question") ?? "What should I remember about renewal validation in this project?";

  const currentFilePath = fileURLToPath(import.meta.url);
  const exampleRoot = resolve(dirname(currentFilePath), "..");
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const transport = new StdioClientTransport({
    command,
    args: ["run", "mcp"],
    cwd: exampleRoot,
    env: toStringEnv(process.env),
    stderr: "inherit"
  });

  const client = new Client({ name: "mcp-smoke-client", version: "0.1.0" });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    console.log("Available tools:", tools.tools.map((tool) => tool.name).join(", "));

    const searchResult = await client.callTool({
      name: "search_project_memory",
      arguments: {
        query,
        projectName,
        featureName,
        threadId,
        limit: 3
      }
    });

    console.log("\nsearch_project_memory output:\n");
    console.log(getTextBlocks(searchResult));

    const askResult = await client.callTool({
      name: "ask_with_memory",
      arguments: {
        question,
        projectName,
        featureName,
        threadId,
        taskType: "analysis",
        limit: 3
      }
    });

    console.log("\nask_with_memory output:\n");
    console.log(getTextBlocks(askResult));
  } finally {
    await transport.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
