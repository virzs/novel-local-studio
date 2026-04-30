import { useEffect, useMemo, useState } from 'react';
import {
  RiQuillPenLine,
  RiFileTextLine,
  RiCompass3Line,
  RiStickyNoteLine,
  RiArchive2Line,
  RiDeleteBinLine,
} from '@remixicon/react';
import { makeLibraryApi, type DocumentDetail, type DocumentKind } from './api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<DocumentKind, string> = {
  folder: '文件夹',
  chapter: '章节',
  setting: '设定',
  outline: '大纲',
  note: '笔记',
};

function formatTs(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DocumentReader({
  backendUrl,
  documentId,
}: {
  backendUrl: string;
  documentId: string | null;
}) {
  const api = useMemo(() => makeLibraryApi(backendUrl), [backendUrl]);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!documentId) {
      setDoc(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getDocument(documentId)
      .then(setDoc)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [api, documentId]);

  async function handleRestore() {
    if (!doc) return;
    setRestoring(true);
    try {
      await api.restoreDocument(doc.id);
      const updated = await api.getDocument(doc.id);
      setDoc(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setRestoring(false);
    }
  }

  if (!documentId) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-neutral-500">
        从左侧选择章节、设定或大纲查看内容
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-sm text-neutral-500">加载中…</div>;
  }

  if (error) {
    return <div className="p-8 text-sm text-red-400">{error}</div>;
  }

  if (!doc) return null;

  const status = doc.status ?? 'active';

  return (
    <article className="max-w-3xl mx-auto px-8 py-10">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
        <KindIcon kind={doc.kind} />
        <span>{KIND_LABEL[doc.kind]}</span>
        <span>·</span>
        <span>{doc.wordCount} 字</span>
      </div>

      {status === 'archived' && (
        <div
          className={cn(
            'flex items-center gap-2 mb-4 px-3 py-2 rounded border text-xs',
            'bg-amber-950/40 border-amber-900 text-amber-200',
          )}
        >
          <RiArchive2Line className="size-3.5 shrink-0" />
          <span className="flex-1">
            此文档已归档
            {doc.archivedAt !== null && (
              <span className="ml-1 text-amber-400/70">
                ({formatTs(doc.archivedAt)} 归档)
              </span>
            )}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={restoring}
            onClick={() => void handleRestore()}
            className="h-6 px-2 text-xs border-amber-800 text-amber-200 hover:bg-amber-900/40 hover:text-amber-100"
          >
            还原
          </Button>
        </div>
      )}

      {status === 'deleted' && (
        <div
          className={cn(
            'flex items-center gap-2 mb-4 px-3 py-2 rounded border text-xs',
            'bg-red-950/40 border-red-900 text-red-200',
          )}
        >
          <RiDeleteBinLine className="size-3.5 shrink-0" />
          <span className="flex-1">
            此文档在回收站中
            {doc.deletedAt !== null && (
              <span className="ml-1 text-red-400/70">
                ({formatTs(doc.deletedAt)} 删除)
              </span>
            )}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={restoring}
            onClick={() => void handleRestore()}
            className="h-6 px-2 text-xs border-red-800 text-red-200 hover:bg-red-900/40 hover:text-red-100"
          >
            还原
          </Button>
        </div>
      )}

      <h1 className="text-2xl font-semibold text-neutral-100 mb-6">{doc.title}</h1>
      {doc.content ? (
        <pre className="whitespace-pre-wrap font-sans text-[15px] leading-7 text-neutral-200">
          {doc.content}
        </pre>
      ) : (
        <div className="text-sm text-neutral-600 italic">(空内容,使用右侧 AI 对话补充)</div>
      )}
    </article>
  );
}

function KindIcon({ kind }: { kind: DocumentKind }) {
  const cls = 'size-3.5';
  switch (kind) {
    case 'chapter':
      return <RiQuillPenLine className={cls} />;
    case 'setting':
      return <RiFileTextLine className={cls} />;
    case 'outline':
      return <RiCompass3Line className={cls} />;
    case 'note':
      return <RiStickyNoteLine className={cls} />;
    default:
      return null;
  }
}
