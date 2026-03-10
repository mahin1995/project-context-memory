import type { RawLogRecord, RetrievedContext, RetrievedMemory } from "../types/memory";
import type { ProjectProfile } from "../types/project";

function formatProject(project: ProjectProfile | null, projectId: string): string[] {
  if (!project) {
    return [`Project ID: ${projectId}`];
  }

  const lines = [`Project ID: ${project.projectId}`];

  if (project.name) {
    lines.push(`Project name: ${project.name}`);
  }

  if (project.description) {
    lines.push(`Project description: ${project.description}`);
  }

  if (project.tags.length > 0) {
    lines.push(`Project tags: ${project.tags.join(", ")}`);
  }

  return lines;
}

function formatMemories(memories: RetrievedMemory[]): string[] {
  if (memories.length === 0) {
    return ["No matching semantic memory entries were found."];
  }

  return memories.map((memory, index) => {
    const parts = [
      `${index + 1}. [${memory.kind}] ${memory.summary}`,
      `Score: ${memory.score.toFixed(4)}`
    ];

    if (memory.title) {
      parts.push(`Title: ${memory.title}`);
    }

    if (memory.tags.length > 0) {
      parts.push(`Tags: ${memory.tags.join(", ")}`);
    }

    parts.push(`Occurred at: ${memory.occurredAt}`);

    return parts.join(" | ");
  });
}

function formatRawLogs(rawLogs: RawLogRecord[]): string[] {
  if (rawLogs.length === 0) {
    return ["No recent raw logs were included."];
  }

  return rawLogs.map((log, index) => {
    const parts = [`${index + 1}. Logged at ${log.occurredAt}`];

    if (log.promptSummary) {
      parts.push(`Prompt: ${log.promptSummary}`);
    }

    if (log.responseSummary) {
      parts.push(`Response: ${log.responseSummary}`);
    }

    if (log.analysisSummary) {
      parts.push(`Analysis: ${log.analysisSummary}`);
    }

    return parts.join(" | ");
  });
}

export function buildContextString(input: {
  projectId: string;
  project: ProjectProfile | null;
  memories: RetrievedMemory[];
  rawLogs: RawLogRecord[];
}): string {
  const sections = [
    "Project",
    ...formatProject(input.project, input.projectId),
    "",
    "Relevant memories",
    ...formatMemories(input.memories),
    "",
    "Recent raw logs",
    ...formatRawLogs(input.rawLogs)
  ];

  return sections.join("\n");
}

export function withContextText(result: Omit<RetrievedContext, "contextText">): RetrievedContext {
  return {
    ...result,
    contextText: buildContextString(result)
  };
}
