import { BaseEmbeddingProvider } from "@mahin14m/project-context-memory";

export class DemoEmbeddingProvider extends BaseEmbeddingProvider {
  constructor() {
    super({
      model: "local-demo-provider",
      dimensions: 256
    });
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((text) => this.embedText(text)));
  }

  embedQuery(text: string): Promise<number[]> {
    return Promise.resolve(this.embedText(text));
  }

  private embedText(text: string): number[] {
    const normalized = text.trim().toLowerCase();
    const vector = Array.from({ length: 256 }, () => 0);

    for (let index = 0; index < normalized.length; index += 1) {
      const code = normalized.charCodeAt(index);
      const slot = index % vector.length;
      const current = vector[slot] ?? 0;

      vector[slot] = (current + code % 97) / 100;
    }

    return vector;
  }
}
