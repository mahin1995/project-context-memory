import { z } from "zod";

const requiredText = z.string().trim().min(1);
const optionalText = z.string().trim().min(1).optional();
const tagArray = z.array(requiredText).max(50).optional();
const pathArray = z.array(requiredText).max(100).optional();

export const storeMemoryInputSchema = z.object({
  projectName: requiredText,
  featureName: requiredText,
  taskType: requiredText,
  summary: requiredText,
  decision: optionalText,
  outcome: optionalText,
  tags: tagArray,
  filePaths: pathArray,
  sourceThreadId: optionalText,
  prompt: optionalText,
  response: optionalText,
  analysis: optionalText
});

export const memorySearchInputSchema = z.object({
  query: requiredText,
  projectName: optionalText,
  featureName: optionalText,
  taskType: optionalText,
  tags: tagArray,
  sourceThreadId: optionalText,
  limit: z.number().int().positive().max(100).optional(),
  minScore: z.number().min(0).max(1).optional()
});
