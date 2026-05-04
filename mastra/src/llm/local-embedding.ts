import type { EmbeddingModelV3 } from '@ai-sdk/provider';
import { env, pipeline, type FeatureExtractionPipeline, type ProgressInfo } from '@huggingface/transformers';
import path from 'node:path';
import { findLocalEmbeddingPreset, LOCAL_EMBEDDING_PRESETS } from './embedding-presets.ts';
import type { ProviderConfig } from './providers.ts';

export type LocalEmbeddingModel = EmbeddingModelV3 & {
  readonly dimension: number;
};

export type LocalModelLoadProgress = {
  modelId: string;
  status: 'idle' | 'downloading' | 'loading' | 'ready' | 'error';
  filesTotal: number;
  filesLoaded: number;
  bytesTotal: number;
  bytesLoaded: number;
  currentFile: string | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
};

type FileProgress = {
  total: number;
  loaded: number;
};

class LocalModelManager {
  private pipelines = new Map<string, Promise<FeatureExtractionPipeline>>();
  private progress = new Map<string, LocalModelLoadProgress>();
  private fileBytes = new Map<string, Map<string, FileProgress>>();

  getProgress(modelId: string): LocalModelLoadProgress {
    return (
      this.progress.get(modelId) ?? {
        modelId,
        status: 'idle',
        filesTotal: 0,
        filesLoaded: 0,
        bytesTotal: 0,
        bytesLoaded: 0,
        currentFile: null,
        error: null,
        startedAt: null,
        finishedAt: null,
      }
    );
  }

  listProgress(): LocalModelLoadProgress[] {
    return Array.from(this.progress.values());
  }

  ensure(modelId: string, cacheDir: string | undefined): Promise<FeatureExtractionPipeline> {
    const existing = this.pipelines.get(modelId);
    if (existing) return existing;
    const startedAt = Date.now();
    this.fileBytes.set(modelId, new Map());
    this.progress.set(modelId, {
      modelId,
      status: 'downloading',
      filesTotal: 0,
      filesLoaded: 0,
      bytesTotal: 0,
      bytesLoaded: 0,
      currentFile: null,
      error: null,
      startedAt,
      finishedAt: null,
    });
    if (cacheDir) {
      const abs = path.resolve(cacheDir);
      env.cacheDir = abs;
      env.localModelPath = abs;
    }
    env.allowLocalModels = true;
    env.useFSCache = true;
    const pending = pipeline('feature-extraction', modelId, {
      dtype: 'fp32',
      progress_callback: (info: ProgressInfo) => this.onProgress(modelId, info),
    })
      .then((extractor) => {
        const cur = this.progress.get(modelId);
        if (cur) {
          this.progress.set(modelId, {
            ...cur,
            status: 'ready',
            finishedAt: Date.now(),
            currentFile: null,
          });
        }
        return extractor;
      })
      .catch((err) => {
        this.pipelines.delete(modelId);
        const cur = this.progress.get(modelId);
        const message = err instanceof Error ? err.message : String(err);
        this.progress.set(modelId, {
          ...(cur ?? this.getProgress(modelId)),
          status: 'error',
          error: message,
          finishedAt: Date.now(),
        });
        throw err;
      });
    this.pipelines.set(modelId, pending);
    return pending;
  }

  private onProgress(modelId: string, info: ProgressInfo): void {
    const cur = this.progress.get(modelId);
    if (!cur) return;
    const files = this.fileBytes.get(modelId) ?? new Map<string, FileProgress>();
    this.fileBytes.set(modelId, files);

    if (info.status === 'progress' || info.status === 'download' || info.status === 'initiate') {
      const file = (info as { file?: string }).file ?? null;
      const total = Number((info as { total?: number }).total ?? 0);
      const loaded = Number((info as { loaded?: number }).loaded ?? 0);
      if (file) {
        const prev = files.get(file) ?? { total: 0, loaded: 0 };
        files.set(file, {
          total: total > prev.total ? total : prev.total,
          loaded: loaded > prev.loaded ? loaded : prev.loaded,
        });
      }
      const aggregate = aggregateBytes(files);
      this.progress.set(modelId, {
        ...cur,
        status: 'downloading',
        currentFile: file,
        filesTotal: files.size,
        filesLoaded: countDoneFiles(files),
        bytesTotal: aggregate.total,
        bytesLoaded: aggregate.loaded,
      });
    } else if (info.status === 'done') {
      const file = (info as { file?: string }).file ?? null;
      if (file) {
        const prev = files.get(file);
        if (prev) files.set(file, { total: prev.total, loaded: prev.total });
      }
      const aggregate = aggregateBytes(files);
      this.progress.set(modelId, {
        ...cur,
        status: 'downloading',
        currentFile: file,
        filesTotal: files.size,
        filesLoaded: countDoneFiles(files),
        bytesTotal: aggregate.total,
        bytesLoaded: aggregate.loaded,
      });
    } else if (info.status === 'ready') {
      this.progress.set(modelId, {
        ...cur,
        status: 'loading',
        currentFile: null,
      });
    }
  }
}

function aggregateBytes(files: Map<string, FileProgress>): { total: number; loaded: number } {
  let total = 0;
  let loaded = 0;
  for (const fp of files.values()) {
    total += fp.total;
    loaded += fp.loaded;
  }
  return { total, loaded };
}

function countDoneFiles(files: Map<string, FileProgress>): number {
  let n = 0;
  for (const fp of files.values()) {
    if (fp.total > 0 && fp.loaded >= fp.total) n += 1;
  }
  return n;
}

export const localModelManager = new LocalModelManager();

export function resolveLocalCacheDir(provider: ProviderConfig, dataDir: string): string {
  if (provider.cacheDir && provider.cacheDir.trim()) return provider.cacheDir;
  return path.join(dataDir, 'models');
}

let _dataDir: string | null = null;

export function setLocalEmbeddingDataDir(dir: string): void {
  const absDir = path.resolve(dir);
  _dataDir = absDir;
  const cacheDir = path.join(absDir, 'models');
  env.cacheDir = cacheDir;
  env.localModelPath = cacheDir;
  env.allowLocalModels = true;
  env.useFSCache = true;
}

function getDataDir(): string {
  if (!_dataDir) throw new Error('local embedding data dir not initialized');
  return _dataDir;
}

const modelCache = new Map<string, LocalEmbeddingModel>();

export function getLocalEmbeddingModel(
  provider: ProviderConfig,
  modelId: string,
): LocalEmbeddingModel {
  const cacheKey = `${provider.id}::${modelId}`;
  const cached = modelCache.get(cacheKey);
  if (cached) return cached;

  const preset = findLocalEmbeddingPreset(modelId);
  if (!preset) {
    const allowed = LOCAL_EMBEDDING_PRESETS.map((p) => p.modelId).join(', ');
    throw new Error(`local embedding model not in preset list: ${modelId}. allowed: ${allowed}`);
  }
  const dimension = preset.dimension;
  const cacheDir = resolveLocalCacheDir(provider, getDataDir());

  const model: LocalEmbeddingModel = {
    specificationVersion: 'v3',
    provider: `local-onnx:${provider.id}`,
    modelId,
    dimension,
    maxEmbeddingsPerCall: 64,
    supportsParallelCalls: false,
    async doEmbed({ values, abortSignal }) {
      if (abortSignal?.aborted) {
        throw abortSignal.reason instanceof Error
          ? abortSignal.reason
          : new Error('aborted');
      }
      const extractor = await localModelManager.ensure(modelId, cacheDir);
      const tensor = await extractor(values, { pooling: 'mean', normalize: true });
      const dims = tensor.dims;
      if (dims.length !== 2 || dims[0] !== values.length || dims[1] !== dimension) {
        throw new Error(
          `local embedding shape mismatch: got [${dims.join(',')}], expected [${values.length},${dimension}]`,
        );
      }
      const flat = tensor.data as Float32Array;
      const out: number[][] = new Array(values.length);
      for (let i = 0; i < values.length; i += 1) {
        const start = i * dimension;
        out[i] = Array.from(flat.subarray(start, start + dimension));
      }
      return {
        embeddings: out,
        usage: { tokens: values.reduce((acc, v) => acc + v.length, 0) },
        warnings: [],
      };
    },
  };
  modelCache.set(cacheKey, model);
  return model;
}

export function clearLocalEmbeddingModelCache(): void {
  modelCache.clear();
}
