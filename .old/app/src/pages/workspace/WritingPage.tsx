import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { listChapters, updateChapter, type Chapter } from '../../api';
import { cn } from '../../lib/utils';

type SaveStatus = 'idle' | 'saving' | 'saved';

export function WritingPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!bookId) return;
    listChapters(bookId)
      .then((data) => {
        const sorted = [...(data.chapters ?? [])].sort((a, b) => a.order - b.order);
        setChapters(sorted);
        if (sorted.length > 0 && !selectedId) {
          setSelectedId(sorted[0].id);
          setContent(sorted[0].content ?? '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookId]);

  const selectedChapter = chapters.find((ch) => ch.id === selectedId) ?? null;

  function handleSelect(ch: Chapter) {
    if (ch.id === selectedId) return;
    setSelectedId(ch.id);
    setContent(ch.content ?? '');
    setSaveStatus('idle');
  }

  const handleSave = useCallback(async () => {
    if (!selectedId) return;
    setSaveStatus('saving');
    try {
      const updated = await updateChapter(selectedId, { content });
      setChapters((prev) => prev.map((ch) => (ch.id === updated.id ? updated : ch)));
      setSaveStatus('saved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  }, [selectedId, content]);

  function countWords(text: string): number {
    const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length;
    const ascii = (text.trim().split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w))).length;
    return cjk + ascii;
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中…</p>;
  }

  return (
    <div className="flex gap-0 h-full min-h-0" style={{ minHeight: 'calc(100vh - 8rem)' }}>
      <aside className="w-52 flex-shrink-0 flex flex-col border-r border-border pr-4 mr-4">
        <p className="text-xs text-muted-foreground tracking-wide uppercase mb-3">章节列表</p>
        {chapters.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-3">暂无章节</p>
        ) : (
          <div className="space-y-0.5 flex-1 overflow-y-auto">
            {chapters.map((ch) => (
              <div
                key={ch.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-sm cursor-pointer transition-colors border',
                  ch.id === selectedId
                    ? 'bg-primary/10 border-primary/25'
                    : 'hover:bg-accent border-transparent',
                )}
                onClick={() => handleSelect(ch)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleSelect(ch)}
              >
                <span className="text-xs text-muted-foreground font-mono w-5 text-right flex-shrink-0">{ch.order}</span>
                <span className={cn('text-sm truncate', ch.id === selectedId ? 'text-primary' : 'text-muted-foreground')}>
                  {ch.title || '（无标题）'}
                </span>
              </div>
            ))}
          </div>
        )}
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {!selectedChapter ? (
          <div className="border border-dashed border-border rounded-sm p-12 text-center flex-1">
            <p className="italic text-muted-foreground text-lg">请从左侧选择一章</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-primary text-xs tracking-[0.16em] uppercase mb-0.5">写作</p>
                <h2 className="text-lg text-foreground leading-tight">{selectedChapter.title || '（无标题）'}</h2>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-muted-foreground font-mono">
                  {countWords(content).toLocaleString('zh-CN')} 字
                </span>
                {saveStatus === 'saved' && (
                  <span className="text-xs text-green-600">已保存</span>
                )}
                {saveStatus === 'saving' && (
                  <span className="text-xs text-muted-foreground">保存中…</span>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={saveStatus === 'saving'}
                >
                  保存
                </Button>
              </div>
            </div>
            <textarea
              className="flex-1 w-full resize-none bg-card border border-border rounded-sm px-4 py-3 text-sm text-foreground leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              value={content}
              onChange={(e) => { setContent(e.target.value); setSaveStatus('idle'); }}
              placeholder="在此处写作…"
            />
          </>
        )}
      </main>
    </div>
  );
}
