import { useEffect, useState } from 'react';

type RebuildPhase = 'idle' | 'recreating-index' | 'backfilling' | 'ready' | 'error';

type RebuildStatus = {
  phase: RebuildPhase;
  reason?: string;
  generation: number;
  startedAt?: number;
  finishedAt?: number;
  backfilled?: number;
  total?: number;
  error?: string;
};

type LocalModelStatus = {
  modelId: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  filesTotal: number;
  filesLoaded: number;
  bytesTotal: number;
  bytesLoaded: number;
  currentFile?: string;
  error?: string;
};

type EmbeddingStatusResponse = {
  rebuild: RebuildStatus;
  localModels: LocalModelStatus[];
  presets: Array<{
    modelId: string;
    label: string;
    dimension: number;
    approxSizeMB: number;
    description: string;
  }>;
};

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function EmbeddingStatusBar({ backendUrl }: { backendUrl: string }) {
  const [status, setStatus] = useState<EmbeddingStatusResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchStatus() {
      try {
        const res = await fetch(`${backendUrl}/api/embedding-status`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data: EmbeddingStatusResponse = await res.json();
          setStatus(data);
        }
      } catch (fetchError) {
        void fetchError;
      }
    }

    void fetchStatus();
    const intervalId = setInterval(() => {
      void fetchStatus();
    }, 1500);

    return () => {
      clearInterval(intervalId);
      controller.abort();
    };
  }, [backendUrl]);

  if (!status) return null;

  const { rebuild, localModels } = status;
  const loadingModels = localModels.filter((m) => m.status === 'loading');
  const isQuiet =
    (rebuild.phase === 'idle' || rebuild.phase === 'ready') && loadingModels.length === 0;

  if (isQuiet) return null;

  return (
    <div className="border-t border-neutral-800 bg-neutral-900/95 backdrop-blur-sm px-4 py-2 text-xs text-neutral-300 space-y-2">
      {rebuild.phase === 'recreating-index' && (
        <div className="space-y-1">
          <span className="text-neutral-400">正在重建向量索引…</span>
          <div className="h-1 rounded-full bg-neutral-800 overflow-hidden">
            <div className="h-full w-1/2 bg-indigo-500 animate-pulse" />
          </div>
        </div>
      )}

      {rebuild.phase === 'backfilling' && (rebuild.total ?? 0) > 0 && (
        <div className="space-y-1">
          <span className="text-neutral-400">
            回填嵌入 {rebuild.backfilled ?? 0}/{rebuild.total}
          </span>
          <div className="h-1 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: `${((rebuild.backfilled ?? 0) / (rebuild.total ?? 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {rebuild.phase === 'error' && (
        <div className="flex items-center gap-3 text-destructive">
          <span className="flex-1 truncate">{rebuild.error ?? '嵌入索引错误'}</span>
          <button
            type="button"
            aria-label="重试嵌入状态（功能存根）"
            className="shrink-0 px-2 py-0.5 rounded border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => window.dispatchEvent(new CustomEvent('embedding-status-retry'))}
          >
            Retry
          </button>
        </div>
      )}

      {loadingModels.map((m) => {
        const progress =
          m.bytesTotal > 0
            ? m.bytesLoaded / m.bytesTotal
            : m.filesTotal > 0
              ? m.filesLoaded / m.filesTotal
              : 0;
        return (
          <div key={m.modelId} className="space-y-1">
            <div className="text-neutral-400 truncate">
              下载 {m.modelId} {m.filesLoaded}/{m.filesTotal} 文件 · {prettyBytes(m.bytesLoaded)}/{prettyBytes(m.bytesTotal)}
            </div>
            {m.currentFile && (
              <div className="text-neutral-500 truncate">{m.currentFile}</div>
            )}
            <div className="h-1 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
