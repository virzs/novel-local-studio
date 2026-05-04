import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import type { EmbeddingModel } from 'ai';
import type { MastraModelConfig } from '@mastra/core/llm';
import {
  getLocalEmbeddingModel,
  type LocalEmbeddingModel,
} from './local-embedding.ts';

export type ProviderKind = 'openai' | 'openai-compatible' | 'local-onnx';

export type ProviderConfig = {
  id: string;
  kind: ProviderKind;
  label: string;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  models?: string[];
  cacheDir?: string;
};

export type ModelBinding = {
  providerId: string;
  model: string;
};

export type EmbeddingBinding = ModelBinding & { dimension: number };

export type Bindings = {
  embedding: EmbeddingBinding;
};

type RegisteredProvider =
  | {
      kind: 'openai' | 'openai-compatible';
      config: ProviderConfig;
      sdk: OpenAIProvider;
    }
  | {
      kind: 'local-onnx';
      config: ProviderConfig;
    };

class ProviderRegistry {
  private providers = new Map<string, RegisteredProvider>();

  reload(configs: ProviderConfig[]): void {
    this.providers.clear();
    for (const c of configs) {
      switch (c.kind) {
        case 'openai':
        case 'openai-compatible': {
          const sdk = createOpenAI({
            baseURL: c.baseUrl,
            apiKey: c.apiKey,
            headers: c.headers,
          });
          this.providers.set(c.id, { kind: c.kind, config: c, sdk });
          break;
        }
        case 'local-onnx': {
          this.providers.set(c.id, { kind: 'local-onnx', config: c });
          break;
        }
      }
    }
  }

  getConfig(providerId: string): ProviderConfig | undefined {
    return this.providers.get(providerId)?.config;
  }

  getLanguageModel(binding: ModelBinding): MastraModelConfig {
    const p = this.providers.get(binding.providerId);
    if (!p) throw new Error(`provider not configured: ${binding.providerId}`);
    if (p.kind === 'local-onnx') {
      throw new Error(
        `provider ${binding.providerId} (local-onnx) does not support language models`,
      );
    }
    return p.sdk.chat(binding.model) as MastraModelConfig;
  }

  getEmbeddingModel(binding: ModelBinding): EmbeddingModel | LocalEmbeddingModel {
    const p = this.providers.get(binding.providerId);
    if (!p) throw new Error(`provider not configured: ${binding.providerId}`);
    if (p.kind === 'local-onnx') {
      return getLocalEmbeddingModel(p.config, binding.model);
    }
    return p.sdk.textEmbeddingModel(binding.model);
  }
}

export const registry = new ProviderRegistry();
