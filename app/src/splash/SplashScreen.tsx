import { useEffect, useRef, useState } from 'react';
import { RiBookOpenLine, RiCheckLine, RiLoader4Line, RiErrorWarningLine } from '@remixicon/react';
import { resolveServerInfo, isBrowserMode, type ServerInfo } from '../lib/serverInfo';

type StepId = 'env' | 'server' | 'health';
type StepState = 'pending' | 'active' | 'done' | 'error';

type Step = {
  id: StepId;
  label: string;
  state: StepState;
};

const INITIAL_STEPS: Step[] = [
  { id: 'env', label: '检测运行环境', state: 'pending' },
  { id: 'server', label: '连接本地服务', state: 'pending' },
  { id: 'health', label: '验证后端就绪', state: 'pending' },
];

const SLOW_HINT_MS = 8000;
const TIMEOUT_MS = 45000;

export function SplashScreen({ onReady }: { onReady: (info: ServerInfo) => void }) {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [error, setError] = useState<string | null>(null);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const startedAt = useRef(Date.now());

  function setStep(id: StepId, state: StepState) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, state } : s)));
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setShowSlowHint(false);
    setSteps(INITIAL_STEPS);
    startedAt.current = Date.now();

    const slowTimer = setTimeout(() => !cancelled && setShowSlowHint(true), SLOW_HINT_MS);

    (async () => {
      try {
        setStep('env', 'active');
        await sleep(150);
        if (cancelled) return;
        setStep('env', 'done');

        setStep('server', 'active');
        const info = await resolveServerInfo();
        if (cancelled) return;
        setStep('server', 'done');

        setStep('health', 'active');
        await pollHealth(info.url, TIMEOUT_MS, () => cancelled);
        if (cancelled) return;
        setStep('health', 'done');

        setFadingOut(true);
        await sleep(280);
        if (!cancelled) onReady(info);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setSteps((prev) =>
          prev.map((s) => (s.state === 'active' ? { ...s, state: 'error' } : s)),
        );
        setError(msg);
      } finally {
        clearTimeout(slowTimer);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, [attempt, onReady]);

  const doneCount = steps.filter((s) => s.state === 'done').length;
  const progress = Math.round((doneCount / steps.length) * 100);
  const currentLabel =
    steps.find((s) => s.state === 'active')?.label ??
    (error ? '启动失败' : doneCount === steps.length ? '就绪' : '准备中');

  return (
    <div
      className={`fixed inset-0 z-50 bg-neutral-950 text-neutral-200 flex items-center justify-center transition-opacity duration-300 ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="w-[400px] max-w-[90vw] flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="size-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/10 border border-neutral-800 flex items-center justify-center">
            <RiBookOpenLine className="size-8 text-indigo-300" />
          </div>
          <div className="text-base font-medium text-neutral-100">Novel Local Studio</div>
        </div>

        <ul className="w-full flex flex-col gap-1.5">
          {steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </ul>

        <div className="w-full flex flex-col gap-2">
          <div className="h-1 w-full bg-neutral-900 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                error
                  ? 'bg-red-500/60'
                  : 'bg-gradient-to-r from-indigo-500 to-violet-500'
              }`}
              style={{ width: `${error ? 100 : progress}%` }}
            />
          </div>
          <div className="text-[11px] text-neutral-500 text-center">
            {error ? '已停止' : `${currentLabel}…`}
          </div>
        </div>

        {error && (
          <div className="w-full flex flex-col gap-2 p-3 rounded-md border border-red-900/50 bg-red-950/20">
            <div className="flex items-center gap-1.5 text-xs text-red-300">
              <RiErrorWarningLine className="size-3.5" />
              <span className="font-medium">无法连接后端</span>
            </div>
            <div className="text-[11px] text-red-200/70 break-all leading-relaxed font-mono">
              {error}
            </div>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setAttempt((n) => n + 1)}
                className="flex-1 text-xs px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-100 transition-colors"
                autoFocus
              >
                重试
              </button>
            </div>
          </div>
        )}

        {!error && showSlowHint && (
          <div className="text-[11px] text-amber-400/80 text-center">
            启动较慢，首次运行可能需要加载模型与索引
          </div>
        )}

        {isBrowserMode() && (
          <div className="text-[10px] text-amber-500/70">[浏览器开发模式]</div>
        )}
      </div>
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  return (
    <li className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs">
      <StepIcon state={step.state} />
      <span
        className={
          step.state === 'done'
            ? 'text-neutral-400'
            : step.state === 'active'
              ? 'text-neutral-100'
              : step.state === 'error'
                ? 'text-red-300'
                : 'text-neutral-600'
        }
      >
        {step.label}
      </span>
    </li>
  );
}

function StepIcon({ state }: { state: StepState }) {
  const cls = 'size-3.5 shrink-0';
  switch (state) {
    case 'done':
      return <RiCheckLine className={`${cls} text-emerald-500`} />;
    case 'active':
      return <RiLoader4Line className={`${cls} text-indigo-300 animate-spin`} />;
    case 'error':
      return <RiErrorWarningLine className={`${cls} text-red-400`} />;
    default:
      return <span className={`${cls} rounded-full border border-neutral-700`} />;
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function pollHealth(url: string, timeoutMs: number, isCancelled: () => boolean) {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    if (isCancelled()) return;
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
      lastErr = new Error(`health returned ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(500);
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`后端未在 ${Math.round(timeoutMs / 1000)} 秒内就绪: ${msg}`);
}
