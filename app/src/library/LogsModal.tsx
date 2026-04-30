import { useEffect, useRef, useState } from 'react';
import { RiPlayLine, RiPauseLine, RiDeleteBinLine, RiArrowDownLine } from '@remixicon/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
type LogEntry = { id: number; ts: number; level: LogLevel; msg: string };

const LEVEL_CLASS: Record<LogLevel, string> = {
  error: 'text-red-400',
  warn: 'text-amber-400',
  info: 'text-sky-300',
  log: 'text-neutral-300',
  debug: 'text-neutral-500',
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  error: 'ERR',
  warn: 'WRN',
  info: 'INF',
  log: 'LOG',
  debug: 'DBG',
};

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds().toString().padStart(3, '0')}`;
}

export function LogsModal({ backendUrl, onClose }: { backendUrl: string; onClose: () => void }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const pausedRef = useRef(paused);
  const esRef = useRef<EventSource | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const seenIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const url = `${backendUrl}/api/logs/stream`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (ev) => {
      if (pausedRef.current) return;
      try {
        const entry = JSON.parse(ev.data) as LogEntry;
        if (seenIds.current.has(entry.id)) return;
        seenIds.current.add(entry.id);
        setEntries((prev) => {
          const next = prev.concat(entry);
          if (next.length > 1000) next.splice(0, next.length - 1000);
          return next;
        });
      } catch {
        void 0;
      }
    };
    es.onerror = () => {
      void 0;
    };
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [backendUrl]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, autoScroll]);

  const filtered = filter.trim()
    ? entries.filter((e) => e.msg.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[90vw] h-[80vh] flex flex-col gap-3 p-0 bg-neutral-950 border-neutral-800">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-neutral-800">
          <DialogTitle className="text-neutral-200 text-sm font-medium">后端日志</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-4">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="过滤关键字…"
            className="flex-1 h-8 bg-neutral-900 border border-neutral-800 rounded px-2 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-700"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPaused((p) => !p)}
            className="h-8 px-2 gap-1 text-xs"
          >
            {paused ? <RiPlayLine className="size-3.5" /> : <RiPauseLine className="size-3.5" />}
            {paused ? '继续' : '暂停'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEntries([]);
              seenIds.current.clear();
            }}
            className="h-8 px-2 gap-1 text-xs"
          >
            <RiDeleteBinLine className="size-3.5" />
            清空
          </Button>
          <Button
            type="button"
            variant={autoScroll ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoScroll((v) => !v)}
            className="h-8 px-2 gap-1 text-xs"
          >
            <RiArrowDownLine className="size-3.5" />
            跟随
          </Button>
        </div>

        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 font-mono text-[11px] leading-relaxed"
        >
          {filtered.length === 0 ? (
            <div className="text-neutral-600 text-xs py-8 text-center">暂无日志</div>
          ) : (
            filtered.map((e) => (
              <div key={e.id} className="py-0.5 flex gap-2 items-start hover:bg-neutral-900/50">
                <span className="text-neutral-600 shrink-0">{fmtTime(e.ts)}</span>
                <span className={`shrink-0 font-semibold ${LEVEL_CLASS[e.level]}`}>{LEVEL_LABEL[e.level]}</span>
                <pre className={`flex-1 whitespace-pre-wrap break-all ${LEVEL_CLASS[e.level]}`}>{e.msg}</pre>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
