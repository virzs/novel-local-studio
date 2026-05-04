export type LocalEmbeddingPreset = {
  modelId: string;
  label: string;
  dimension: number;
  approxSizeMB: number;
  description: string;
};

export const LOCAL_EMBEDDING_PRESETS: LocalEmbeddingPreset[] = [
  {
    modelId: 'Xenova/bge-small-zh-v1.5',
    label: 'BGE Small ZH v1.5（512d，约 95MB）',
    dimension: 512,
    approxSizeMB: 95,
    description: '中文通用轻量模型，首跑下载快、内存占用低，适合大多数设备',
  },
  {
    modelId: 'Xenova/bge-m3',
    label: 'BGE M3（1024d，约 1.2GB）',
    dimension: 1024,
    approxSizeMB: 1200,
    description: '多语种高质量模型，召回更强，但首跑需较长下载与较多内存',
  },
];

export const DEFAULT_LOCAL_EMBEDDING_PRESET = LOCAL_EMBEDDING_PRESETS[0]!;

export function findLocalEmbeddingPreset(modelId: string): LocalEmbeddingPreset | undefined {
  return LOCAL_EMBEDDING_PRESETS.find((p) => p.modelId === modelId);
}

export const LOCAL_PROVIDER_ID = 'local-default';
