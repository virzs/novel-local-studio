import { RiBookOpenLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';

export function AboutTab({ backendUrl }: { backendUrl: string }) {
  return (
    <div className="flex flex-col items-center py-10 space-y-5">
      <div className="size-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/10 border border-neutral-800 flex items-center justify-center">
        <RiBookOpenLine className="size-12 text-indigo-300" />
      </div>

      <div className="text-center space-y-1">
        <div className="text-xl font-medium text-neutral-100">Novel Local Studio</div>
        <div className="text-sm text-muted-foreground">v0.0.0</div>
      </div>

      <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
        AI-first local-first novel writing desktop app. Tauri + React + Mastra.
      </p>

      <div className="text-xs text-muted-foreground font-mono">Backend: {backendUrl}</div>

      <div className="flex items-center gap-2 pt-2">
        <Button variant="link" size="sm" className="text-xs text-muted-foreground">
          项目主页
        </Button>
        <span className="text-neutral-800 select-none">·</span>
        <Button variant="link" size="sm" className="text-xs text-muted-foreground">
          反馈问题
        </Button>
        <span className="text-neutral-800 select-none">·</span>
        <Button variant="link" size="sm" className="text-xs text-muted-foreground">
          开源协议
        </Button>
      </div>
    </div>
  );
}
