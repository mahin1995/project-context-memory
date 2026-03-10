export function normalizeTags(tags: string[] = []): string[] {
  const values = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);

  return [...new Set(values)];
}
