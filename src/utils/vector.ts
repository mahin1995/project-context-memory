import { ConfigurationError } from "../core/errors";

export function assertVectorDimensions(vector: number[], expectedDimensions: number): number[] {
  if (vector.length !== expectedDimensions) {
    throw new ConfigurationError(
      `Embedding dimensions mismatch. Expected ${expectedDimensions}, received ${vector.length}.`
    );
  }

  if (!vector.every((value) => Number.isFinite(value))) {
    throw new ConfigurationError("Embedding vectors must contain only finite numeric values.");
  }

  return vector;
}

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
