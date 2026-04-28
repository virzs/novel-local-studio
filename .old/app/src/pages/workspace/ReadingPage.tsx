import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import type { Project, MastraInfo } from '../../types';
import { listChapters } from '../../api';
import type { Chapter } from '../../api';

type OutletCtx = { projects: Project[]; mastraInfo: MastraInfo | null };

export function ReadingPage() {
  const { projects } = useOutletContext<OutletCtx>();
  const { bookId } = useParams<{ bookId: string }>();
  const book = projects.find((p) => p.id === bookId);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookId) return;
    listChapters(bookId)
      .then((data) => {
        const sorted = [...(data.chapters ?? [])].sort((a, b) => a.order - b.order);
        setChapters(sorted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookId]);

  function handleExport() {
    const lines: string[] = [];
    if (book?.name) lines.push(book.name, '');
    for (const ch of chapters) {
      lines.push(`第${ch.order}章 ${ch.title}`, '');
      if (ch.content) lines.push(ch.content, '');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book?.name ?? 'novel'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中…</p>;
  }

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-primary text-xs tracking-[0.16em] uppercase mb-1">阅读</p>
          <h2 className="text-2xl text-foreground leading-tight">{book?.name ?? '未知书籍'}</h2>
        </div>
        <Button type="button" variant="outline" onClick={handleExport} disabled={chapters.length === 0}>
          导出 TXT
        </Button>
      </div>

      {chapters.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-12 text-center">
          <p className="italic text-muted-foreground text-lg">暂无章节内容</p>
        </div>
      ) : (
        <div className="max-w-2xl space-y-10">
          {chapters.map((ch) => (
            <article key={ch.id}>
              <h2 className="text-lg text-foreground mb-4 pb-2 border-b border-border">
                第{ch.order}章&nbsp;&nbsp;{ch.title}
              </h2>
              {ch.content ? (
                <div className="space-y-3">
                  {ch.content.split(/\n+/).filter(Boolean).map((para, i) => (
                    <p key={i} className="text-sm text-foreground leading-relaxed">
                      {para}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">（本章暂无内容）</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
