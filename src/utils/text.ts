import type { ConversationProjectSnapshot, MemoryKind } from "../types/memory";
import type { JsonRecord } from "../types/json";

interface BuildEmbeddingTextInput {
  projectId: string;
  kind: MemoryKind;
  title: string | null;
  summary: string;
  tags: string[];
  metadata: JsonRecord;
}

export function toIsoTimestamp(value?: Date | string): string {
  const resolved = value ? new Date(value) : new Date();

  if (Number.isNaN(resolved.valueOf())) {
    throw new Error("Invalid timestamp supplied.");
  }

  return resolved.toISOString();
}

export function buildEmbeddingText(input: BuildEmbeddingTextInput): string {
  const sections = [
    `Project: ${input.projectId}`,
    `Kind: ${input.kind}`,
    input.title ? `Title: ${input.title}` : null,
    `Summary: ${input.summary}`,
    input.tags.length > 0 ? `Tags: ${input.tags.join(", ")}` : null
  ];

  const metadataKeys = Object.keys(input.metadata).sort();

  if (metadataKeys.length > 0) {
    sections.push(`Metadata keys: ${metadataKeys.join(", ")}`);
  }

  return sections.filter((section): section is string => Boolean(section)).join("\n");
}

export function buildProjectMetadataSummary(project: ConversationProjectSnapshot): string {
  const parts: string[] = [];

  if (project.name) {
    parts.push(`Name: ${project.name}`);
  }

  if (project.description) {
    parts.push(`Description: ${project.description}`);
  }

  const metadataKeys = Object.keys(project.metadata ?? {}).sort();

  if (metadataKeys.length > 0) {
    parts.push(`Metadata keys: ${metadataKeys.join(", ")}`);
  }

  const tags = project.tags ?? [];

  if (tags.length > 0) {
    parts.push(`Project tags: ${tags.join(", ")}`);
  }

  return parts.join(". ");
}

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeOptionalText(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeStringList(values: string[] = []): string[] {
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}
