import type { JsonRecord } from "./json";
import type { ProjectProfile, UpsertProjectProfileInput } from "./project";

export type MemoryKind =
  | "prompt_summary"
  | "response_summary"
  | "analysis_summary"
  | "decision"
  | "outcome"
  | "project_metadata"
  | "note";

export interface ConversationSegmentInput {
  raw?: string;
  summary: string;
  metadata?: JsonRecord;
}

export type ConversationProjectSnapshot = Omit<
  UpsertProjectProfileInput,
  "projectId" | "mergeMetadata"
>;

export interface CaptureConversationInput {
  projectId: string;
  sessionId?: string;
  prompt?: ConversationSegmentInput;
  response?: ConversationSegmentInput;
  analysis?: ConversationSegmentInput;
  decisions?: string[];
  outcomes?: string[];
  tags?: string[];
  metadata?: JsonRecord;
  occurredAt?: Date | string;
  project?: ConversationProjectSnapshot;
}

export interface RememberInput {
  projectId: string;
  sessionId?: string;
  sourceLogId?: string;
  kind: MemoryKind;
  title?: string;
  summary: string;
  details?: JsonRecord;
  tags?: string[];
  metadata?: JsonRecord;
  occurredAt?: Date | string;
}

export interface RawLogRecord {
  id: string;
  projectId: string;
  sessionId: string | null;
  promptText: string | null;
  promptSummary: string | null;
  responseText: string | null;
  responseSummary: string | null;
  analysisText: string | null;
  analysisSummary: string | null;
  tags: string[];
  metadata: JsonRecord;
  occurredAt: string;
  createdAt: string;
}

export interface MemoryRecord {
  id: string;
  projectId: string;
  sourceLogId: string | null;
  sessionId: string | null;
  kind: MemoryKind;
  title: string | null;
  summary: string;
  details: JsonRecord;
  tags: string[];
  metadata: JsonRecord;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetrievedMemory extends MemoryRecord {
  score: number;
}

export interface MemoryDraft {
  id: string;
  projectId: string;
  sourceLogId: string | null;
  sessionId: string | null;
  kind: MemoryKind;
  title: string | null;
  summary: string;
  details: JsonRecord;
  tags: string[];
  metadata: JsonRecord;
  occurredAt: string;
  embeddingText: string;
}

export interface PreparedMemoryRecord extends Omit<MemoryDraft, "embeddingText"> {
  embedding: number[];
}

export interface PreparedRawLogRecord {
  id: string;
  projectId: string;
  sessionId: string | null;
  promptText: string | null;
  promptSummary: string | null;
  responseText: string | null;
  responseSummary: string | null;
  analysisText: string | null;
  analysisSummary: string | null;
  tags: string[];
  metadata: JsonRecord;
  occurredAt: string;
}

export interface CaptureConversationResult {
  project: ProjectProfile | null;
  rawLog: RawLogRecord;
  memories: MemoryRecord[];
}

export interface RetrieveContextInput {
  projectId: string;
  query: string;
  limit?: number;
  tags?: string[];
  memoryKinds?: MemoryKind[];
  metadata?: JsonRecord;
  sessionId?: string;
  minScore?: number;
  includeRawLogs?: boolean;
  rawLogLimit?: number;
}

export interface RecentLogsInput {
  projectId: string;
  sessionId?: string;
  limit?: number;
}

export interface RetrievedContext {
  projectId: string;
  query: string;
  retrievedAt: string;
  project: ProjectProfile | null;
  memories: RetrievedMemory[];
  rawLogs: RawLogRecord[];
  contextText: string;
}

export interface StoreMemoryInput {
  projectName: string;
  featureName: string;
  taskType: string;
  summary: string;
  decision?: string;
  outcome?: string;
  tags?: string[];
  filePaths?: string[];
  sourceThreadId?: string;
  prompt?: string;
  response?: string;
  analysis?: string;
}

export interface ValidatedStoreMemoryInput {
  projectName: string;
  featureName: string;
  taskType: string;
  summary: string;
  decision: string | null;
  outcome: string | null;
  tags: string[];
  filePaths: string[];
  sourceThreadId: string | null;
  prompt: string | null;
  response: string | null;
  analysis: string | null;
}

export interface MemorySearchInput {
  query: string;
  projectName?: string;
  featureName?: string;
  taskType?: string;
  tags?: string[];
  sourceThreadId?: string;
  limit?: number;
  minScore?: number;
}

export interface ValidatedMemorySearchInput {
  query: string;
  projectName: string | null;
  featureName: string | null;
  taskType: string | null;
  tags: string[];
  sourceThreadId: string | null;
  limit: number;
  minScore: number | null;
}

export interface MemoryEntryRecord {
  id: string;
  projectName: string;
  featureName: string;
  taskType: string;
  summary: string;
  decision: string | null;
  outcome: string | null;
  tags: string[];
  filePaths: string[];
  sourceThreadId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryRawLogRecord {
  id: string;
  memoryEntryId: string;
  prompt: string | null;
  response: string | null;
  analysis: string | null;
  createdAt: string;
}

export interface MemoryWriteResult {
  entry: MemoryEntryRecord;
  rawLog: MemoryRawLogRecord | null;
}

export interface MemorySearchResult extends MemoryEntryRecord {
  score: number;
}

export interface UpsertMemoryEntryInput {
  projectName: string;
  featureName: string;
  taskType: string;
  summary: string;
  decision: string | null;
  outcome: string | null;
  tags: string[];
  filePaths: string[];
  sourceThreadId: string | null;
  embedding: number[];
}

export interface InsertMemoryRawLogInput {
  memoryEntryId: string;
  prompt: string | null;
  response: string | null;
  analysis: string | null;
}
