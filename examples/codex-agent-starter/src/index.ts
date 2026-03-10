import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectContextMemory } from "@mahin14m/project-context-memory";
import { DemoEmbeddingProvider } from "./demo-embedding-provider";

type Command = "demo" | "recall" | "remember";

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
      `Set ${name} before running this example project. You can copy .env.example to .env in examples/codex-agent-starter.`
    );
  }

  return value;
}

function getOption(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function getCommand(): Command {
  const command = process.argv[2];

  if (command === "demo" || command === "recall" || command === "remember") {
    return command;
  }

  throw new Error("Use one of: demo, recall, remember");
}

function getProjectName(): string {
  return getOption("--project") ?? getRequiredEnv("PROJECT_NAME");
}

function getFeatureName(): string {
  return getOption("--feature") ?? process.env.FEATURE_NAME ?? "general";
}

function getThreadId(): string | undefined {
  return getOption("--thread") ?? process.env.CODEX_THREAD_ID;
}

async function createMemory(): Promise<ProjectContextMemory> {
  return new ProjectContextMemory({
    postgresUrl: getRequiredEnv("DATABASE_URL"),
    embeddingProvider: new DemoEmbeddingProvider(),
    embedding: {
      model: "local-demo-provider",
      dimensions: 256
    }
  }).setup();
}

async function runRecall(memory: ProjectContextMemory): Promise<void> {
  const query = process.argv.slice(3).join(" ").trim();

  if (!query) {
    throw new Error("Pass a query after `npm run recall --`.");
  }

  const results = await memory.search({
    query,
    projectName: getProjectName(),
    featureName: getFeatureName(),
    sourceThreadId: getThreadId(),
    limit: Number(getOption("--limit") ?? "5")
  });

  console.log(JSON.stringify(results, null, 2));
}

async function runRemember(memory: ProjectContextMemory): Promise<void> {
  const summary = getOption("--summary");

  if (!summary) {
    throw new Error("Pass `--summary` when using the remember command.");
  }

  const result = await memory.store({
    projectName: getProjectName(),
    featureName: getFeatureName(),
    taskType: getOption("--taskType") ?? "analysis",
    summary,
    decision: getOption("--decision"),
    outcome: getOption("--outcome"),
    sourceThreadId: getThreadId(),
    prompt: getOption("--prompt"),
    response: getOption("--response"),
    analysis: getOption("--analysis"),
    tags: (getOption("--tags") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  });

  console.log(JSON.stringify(result, null, 2));
}

async function runDemo(memory: ProjectContextMemory): Promise<void> {
  await memory.store({
    projectName: getProjectName(),
    featureName: getFeatureName(),
    taskType: "analysis",
    summary: "Codex fixed a renewal-validation bug before invoice creation.",
    decision: "Validate trial expiration before generating invoices.",
    outcome: "Invalid renewals no longer create invoices.",
    sourceThreadId: getThreadId(),
    tags: ["codex", "billing", "renewal"]
  });

  const results = await memory.search({
    query: "How did Codex fix renewal validation?",
    projectName: getProjectName(),
    featureName: getFeatureName(),
    sourceThreadId: getThreadId(),
    limit: 3
  });

  console.log(JSON.stringify(results, null, 2));
}

async function main(): Promise<void> {
  loadDotEnv();
  const memory = await createMemory();

  try {
    const command = getCommand();

    if (command === "recall") {
      await runRecall(memory);
      return;
    }

    if (command === "remember") {
      await runRemember(memory);
      return;
    }

    await runDemo(memory);
  } finally {
    await memory.close();
  }
}

void main();
