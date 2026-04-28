import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { UnarchiveIcon, TrashIcon } from '../../components/business/shared/Icons';
import { listArchivedProjects, unarchiveProject, deleteProject } from '../../api';
import type { Project } from '../../types';

function ArchivedBookCard({
  project,
  onUnarchive,
  onDeleteRequest,
}: {
  project: Project;
  onUnarchive: (project: Project) => void;
  onDeleteRequest: (project: Project) => void;
}) {
  return (
    <Card className="group relative gap-2 py-4 bg-card border-border hover:border-border rounded-sm transition-colors shadow-none">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-foreground text-base leading-snug">
          {project.name}
        </CardTitle>
        <CardAction className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onUnarchive(project)}
            title="取消归档"
          >
            <UnarchiveIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDeleteRequest(project)}
            className="hover:text-destructive hover:bg-destructive/10"
            title="永久删除"
          >
            <TrashIcon />
          </Button>
        </CardAction>
      </CardHeader>

      {project.genre && (
        <CardContent className="px-4 py-0">
          <p className="text-xs text-muted-foreground leading-snug">
            {project.genre}
          </p>
        </CardContent>
      )}

      <CardFooter className="px-4 pt-1 pb-0 flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          归档于 {new Date(project.updatedAt).toLocaleDateString()}
        </span>
      </CardFooter>
    </Card>
  );
}

export function ArchivedBooksPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);

  async function loadArchived() {
    try {
      const data = await listArchivedProjects();
      setProjects(data.projects ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadArchived(); }, []);

  async function handleUnarchive(project: Project) {
    try {
      await unarchiveProject(project.id);
      await loadArchived();
    } catch {
      void 0;
    }
  }

  async function handleDelete(project: Project) {
    try {
      await deleteProject(project.id);
      await loadArchived();
    } catch {
      void 0;
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中…</p>;
  }

  if (loadError) {
    return <p className="text-destructive text-sm">{loadError}</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground text-sm">
          共 {projects.length} 本归档书籍
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-12 text-center">
          <p className="italic text-muted-foreground text-lg">
            暂无归档书籍
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            在侧栏书籍上悬停可归档书籍
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm" aria-hidden="true">📦</span>
            <span className="text-xs text-muted-foreground tracking-widest uppercase">
              归档书籍
            </span>
            <div className="flex-1 h-px bg-muted" />
            <span className="text-xs text-muted-foreground font-mono">
              {projects.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ArchivedBookCard
                key={p.id}
                project={p}
                onUnarchive={(proj) => void handleUnarchive(proj)}
                onDeleteRequest={(proj) => setConfirmDelete(proj)}
              />
            ))}
          </div>
        </div>
      )}

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除书籍</AlertDialogTitle>
            <AlertDialogDescription>
              确定要永久删除「{confirmDelete?.name}」吗？此操作无法撤销，所有章节、角色、世界设定等数据将一并删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDelete) {
                  void handleDelete(confirmDelete);
                  setConfirmDelete(null);
                }
              }}
            >
              永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
