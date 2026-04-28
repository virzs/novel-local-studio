import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../../ui/hover-card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../../ui/alert-dialog";
import { Input } from "../../ui/input";
import { GearIcon, PlusIcon, ArchiveIcon } from "../shared/Icons";
import type { Project } from "../../../types";
import { ThemeToggle } from "../shared/ThemeToggle";

const SIDEBAR_W = 56;

const BOOK_ICON_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
] as const;

function getBookColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return BOOK_ICON_COLORS[Math.abs(hash) % BOOK_ICON_COLORS.length];
}

type BookSidebarProps = {
  projects: Project[];
  isHealthy: boolean;
  activeBookId: string | null;
  onBookSelect: (id: string) => void;
  onStatusClick: () => void;
  onArchive: (id: string) => Promise<void>;
};

export function BookSidebar({
  projects,
  isHealthy,
  activeBookId,
  onBookSelect,
  onStatusClick,
  onArchive,
}: BookSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [archiveTarget, setArchiveTarget] = useState<Project | null>(null);
  const [archiveInput, setArchiveInput] = useState("");

  const urlBookId = location.pathname.match(/^\/books\/([^/]+)/)?.[1] ?? null;
  const effectiveActiveId = activeBookId ?? urlBookId;

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className="flex flex-col h-screen flex-shrink-0 bg-card border-r border-border"
        style={{ width: SIDEBAR_W }}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          <div className="flex flex-col items-center gap-2 px-2">
            {projects.map((project) => {
              const initial = (project.name ?? "?").charAt(0).toUpperCase();
              const color = getBookColor(project.id);
              const isActive = project.id === effectiveActiveId;

              return (
                <BookIconButton
                  key={project.id}
                  project={project}
                  initial={initial}
                  color={color}
                  isActive={isActive}
                  onClick={() => onBookSelect(project.id)}
                  onArchiveClick={() => setArchiveTarget(project)}
                />
              );
            })}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate("/new-book")}
                  className="flex items-center justify-center size-9 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground"
                >
                  <PlusIcon />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">新建书籍</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1 py-3 border-t border-border flex-shrink-0">
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href="/settings"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/settings");
                }}
                className="flex items-center justify-center size-8 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <GearIcon />
              </a>
            </TooltipTrigger>
            <TooltipContent side="right">设置</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onStatusClick}
                className="flex items-center justify-center size-8 rounded-md transition-colors hover:bg-accent"
              >
                <span
                  className={[
                    "w-2.5 h-2.5 rounded-full transition-colors",
                    isHealthy ? "bg-success" : "bg-destructive animate-pulse",
                  ].join(" ")}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isHealthy ? "服务运行中" : "服务离线"}
            </TooltipContent>
          </Tooltip>
        </div>

        <AlertDialog
          open={archiveTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setArchiveTarget(null);
              setArchiveInput("");
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>归档书籍</AlertDialogTitle>
              <AlertDialogDescription>
                确定要归档「{archiveTarget?.name}
                」吗？归档后书籍将从侧栏隐藏，可在设置中恢复。
                <br />
                请输入 <strong>确认归档</strong> 以继续。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={archiveInput}
              onChange={(e) => setArchiveInput(e.target.value)}
              placeholder="输入 确认归档"
              className="mt-2"
            />
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setArchiveTarget(null);
                  setArchiveInput("");
                }}
              >
                取消
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={archiveInput.trim() !== "确认归档"}
                onClick={() => {
                  if (archiveTarget && archiveInput.trim() === "确认归档") {
                    void onArchive(archiveTarget.id);
                    setArchiveTarget(null);
                    setArchiveInput("");
                  }
                }}
              >
                归档
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </aside>
    </TooltipProvider>
  );
}

function BookIconButton({
  project,
  initial,
  color,
  isActive,
  onClick,
  onArchiveClick,
}: {
  project: Project;
  initial: string;
  color: string;
  isActive: boolean;
  onClick: () => void;
  onArchiveClick: () => void;
}) {
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          onClick={onClick}
          className={[
            "flex items-center justify-center size-9 rounded-lg text-sm font-bold text-white transition-all",
            isActive
              ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
              : "hover:ring-1 hover:ring-muted-foreground hover:ring-offset-1 hover:ring-offset-background",
          ].join(" ")}
          style={{ backgroundColor: color }}
        >
          {initial}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        sideOffset={12}
        align="center"
        className="w-56 bg-muted border-border text-foreground p-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug truncate">{project.name}</p>
            {project.genre && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {project.genre}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onArchiveClick();
            }}
            className="flex-shrink-0 p-1 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="归档书籍"
          >
            <ArchiveIcon />
          </button>
        </div>
        {project.synopsis && (
          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3 leading-relaxed">
            {project.synopsis}
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
