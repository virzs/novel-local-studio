import { useEffect, useMemo, useState } from 'react';
import { RiQuillPenLine, RiFileTextLine, RiCompass3Line, RiStickyNoteLine } from '@remixicon/react';
import { makeLibraryApi, type DocumentDetail, type DocumentKind } from './api';

const KIND_LABEL: Record<DocumentKind, string> = {
  folder: '文件夹',
  chapter: '章节',
  setting: '设定',
  outline: '大纲',
  note: '笔记',
};

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

  return (
    <article className="max-w-3xl mx-auto px-8 py-10">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
        <KindIcon kind={doc.kind} />
        <span>{KIND_LABEL[doc.kind]}</span>
        <span>·</span>
        <span>{doc.wordCount} 字</span>
      </div>
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
