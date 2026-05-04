import { ensureOrRecreateNovelIndex } from '../db/vector.ts';
import {
  embedDocumentByIdSafe,
  deleteDocumentEmbeddings,
  backfillEmbeddings,
} from './embeddings.ts';
import { getBindings } from '../agents/bindings-cache.ts';

export type EmbeddingRebuildPhase =
  | 'idle'
  | 'recreating-index'
  | 'backfilling'
  | 'ready'
  | 'error';

export type EmbeddingRebuildStatus = {
  generation: number;
  phase: EmbeddingRebuildPhase;
  providerId: string;
  model: string;
  dimension: number;
  previousDimension: number | null;
  recreatedIndex: boolean;
  embedded: number;
  skipped: number;
  failed: number;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
};

class EmbeddingCoordinator {
  private generation = 0;
  private status: EmbeddingRebuildStatus = {
    generation: 0,
    phase: 'idle',
    providerId: '',
    model: '',
    dimension: 0,
    previousDimension: null,
    recreatedIndex: false,
    embedded: 0,
    skipped: 0,
    failed: 0,
    error: null,
    startedAt: null,
    finishedAt: null,
  };
  private current: Promise<void> | null = null;

  getStatus(): EmbeddingRebuildStatus {
    return { ...this.status };
  }

  currentGeneration(): number {
    return this.generation;
  }

  onUpsert(documentId: string): void {
    const gen = this.generation;
    void embedDocumentByIdSafe(documentId).catch((e) =>
      console.warn(`[embed] upsert failed gen=${gen} doc=${documentId}:`, (e as Error).message),
    );
  }

  onDelete(documentId: string): void {
    void deleteDocumentEmbeddings(documentId).catch((e) =>
      console.warn(`[embed] delete failed doc=${documentId}:`, (e as Error).message),
    );
  }

  scheduleRebuild(reason: string): Promise<void> {
    this.generation += 1;
    const gen = this.generation;
    const binding = getBindings().embedding;
    const startedAt = Date.now();
    this.status = {
      generation: gen,
      phase: 'recreating-index',
      providerId: binding.providerId,
      model: binding.model,
      dimension: binding.dimension,
      previousDimension: this.status.dimension || null,
      recreatedIndex: false,
      embedded: 0,
      skipped: 0,
      failed: 0,
      error: null,
      startedAt,
      finishedAt: null,
    };
    console.log(
      `[embed] rebuild gen=${gen} reason=${reason} provider=${binding.providerId} model=${binding.model} dim=${binding.dimension}`,
    );

    const run = (async () => {
      try {
        const { recreated, previousDimension } = await ensureOrRecreateNovelIndex(binding.dimension);
        if (gen !== this.generation) return;
        this.status = {
          ...this.status,
          recreatedIndex: recreated,
          previousDimension,
          phase: 'backfilling',
        };
        const r = await backfillEmbeddings();
        if (gen !== this.generation) return;
        this.status = {
          ...this.status,
          phase: 'ready',
          embedded: r.embedded,
          skipped: r.skipped,
          failed: r.failed,
          finishedAt: Date.now(),
        };
        console.log(
          `[embed] rebuild gen=${gen} done recreated=${recreated} prev=${previousDimension} embedded=${r.embedded} skipped=${r.skipped} failed=${r.failed}`,
        );
      } catch (e) {
        if (gen !== this.generation) return;
        const message = e instanceof Error ? e.message : String(e);
        this.status = {
          ...this.status,
          phase: 'error',
          error: message,
          finishedAt: Date.now(),
        };
        console.error(`[embed] rebuild gen=${gen} failed:`, message);
      }
    })();
    this.current = run;
    return run;
  }

  async waitForCurrent(): Promise<void> {
    if (this.current) await this.current;
  }
}

export const embeddingCoordinator = new EmbeddingCoordinator();
