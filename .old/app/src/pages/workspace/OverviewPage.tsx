import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import type { Project, MastraInfo, WorldSetting } from '../../types';
import { listChapters, listWorldSettings } from '../../api';
import type { Chapter } from '../../api';

type OutletCtx = { projects: Project[]; mastraInfo: MastraInfo | null };

const STATUS_LABELS: Record<string, string> = {
  drafting: '构思中',
  writing: '写作中',
  revising: '修改中',
  completed: '已完成',
};

const STATUS_VARIANTS: Record<string, string> = {
  drafting: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  writing: 'bg-green-500/10 text-green-600 border-green-500/20',
  revising: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  completed: 'bg-muted text-muted-foreground border-border',
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-sm px-5 py-4">
      <p className="text-xs text-muted-foreground tracking-wide uppercase mb-1">{label}</p>
      <p className="text-2xl text-foreground font-mono leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function OverviewPage() {
  const { projects } = useOutletContext<OutletCtx>();
  const { bookId } = useParams<{ bookId: string }>();
  const book = projects.find((p) => p.id === bookId);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [settings, setSettings] = useState<WorldSetting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookId) return;
    setLoading(true);
    Promise.all([
      listChapters(bookId),
      listWorldSettings(bookId),
    ])
      .then(([chRes, settingsRes]) => {
        setChapters(chRes.chapters ?? []);
        setSettings(settingsRes.settings ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookId]);

  const totalWords = chapters.reduce((acc, ch) => acc + (ch.wordCount ?? ch.content?.length ?? 0), 0);
  const characterCount = settings.filter((setting) => setting.typeId.startsWith('wst-characters--')).length;
  const statusVariant = book ? (STATUS_VARIANTS[book.status] ?? STATUS_VARIANTS.completed) : '';
  const statusLabel = book ? (STATUS_LABELS[book.status] ?? book.status) : '';

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-primary text-xs tracking-[0.16em] uppercase mb-1">概览</p>
          <h2 className="text-2xl text-foreground leading-tight truncate">{book?.name ?? '未知书籍'}</h2>
          {book?.genre && (
            <p className="text-sm text-muted-foreground mt-0.5">{book.genre}</p>
          )}
        </div>
        {book && (
          <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-sm border text-xs font-medium ${statusVariant}`}>
            {statusLabel}
          </span>
        )}
      </div>

      {book?.synopsis && (
        <div className="bg-muted/40 border border-border rounded-sm px-5 py-4">
          <p className="text-xs text-muted-foreground tracking-wide uppercase mb-2">简介</p>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{book.synopsis}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="章节数" value={chapters.length} sub="章" />
        <StatCard label="总字数" value={totalWords.toLocaleString('zh-CN')} sub="字" />
        <StatCard label="角色数" value={characterCount} sub="个" />
        <StatCard label="世界设定" value={settings.length} sub="条" />
      </div>

      {chapters.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground tracking-wide uppercase mb-3">章节进度</p>
          <div className="space-y-1.5">
            {chapters.slice(0, 8).map((ch) => {
              const words = ch.wordCount ?? ch.content?.length ?? 0;
              return (
                <div key={ch.id} className="flex items-center justify-between px-4 py-2 bg-card border border-border rounded-sm">
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-muted-foreground font-mono w-6 text-right flex-shrink-0">{ch.order}</span>
                    <span className="text-sm text-foreground truncate">{ch.title}</span>
                  </span>
                  <span className="text-xs text-muted-foreground font-mono flex-shrink-0 ml-3">{words.toLocaleString('zh-CN')} 字</span>
                </div>
              );
            })}
            {chapters.length > 8 && (
              <p className="text-xs text-muted-foreground px-4 pt-1">…还有 {chapters.length - 8} 章</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
