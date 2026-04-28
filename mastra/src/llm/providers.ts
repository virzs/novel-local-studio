import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import type { EmbeddingModel } from 'ai';
import type { MastraModelConfig } from '@mastra/core/llm';

export type ProviderKind = 'openai' | 'openai-compatible';

export type ProviderConfig = {
  id: string;
  kind: ProviderKind;
  label: string;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  models?: string[];
};

export type ModelBinding = {
  providerId: string;
  model: string;
};

export type EmbeddingBinding = ModelBinding & { dimension: number };

export type Bindings = {
  embedding: EmbeddingBinding;
};

class ProviderRegistry {
  private providers = new Map<string, OpenAIProvider>();

  reload(configs: ProviderConfig[]): void {
    this.providers.clear();
    for (const c of configs) {
      switch (c.kind) {
        case 'openai':
        case 'openai-compatible': {
          const provider = createOpenAI({
            baseURL: c.baseUrl,
            apiKey: c.apiKey,
            headers: c.headers,
          });
          this.providers.set(c.id, provider);
          break;
        }
      }
    }
  }

  getLanguageModel(binding: ModelBinding): MastraModelConfig {
    const p = this.providers.get(binding.providerId);
    if (!p) throw new Error(`provider not configured: ${binding.providerId}`);
    return p.chat(binding.model) as MastraModelConfig;
  }

  getEmbeddingModel(binding: ModelBinding): EmbeddingModel {
    const p = this.providers.get(binding.providerId);
    if (!p) throw new Error(`provider not configured: ${binding.providerId}`);
    return p.textEmbeddingModel(binding.model);
  }
}

export const registry = new ProviderRegistry();
