export interface EmbeddingProvider {
  readonly model?: string;
  readonly dimensions?: number;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export interface BaseEmbeddingProviderOptions {
  model?: string;
  dimensions?: number;
}

export abstract class BaseEmbeddingProvider implements EmbeddingProvider {
  readonly model?: string;
  readonly dimensions?: number;

  constructor(options: BaseEmbeddingProviderOptions = {}) {
    this.model = options.model;
    this.dimensions = options.dimensions;
  }

  abstract embedDocuments(texts: string[]): Promise<number[][]>;
  abstract embedQuery(text: string): Promise<number[]>;
}
