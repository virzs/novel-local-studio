import { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { AIChatPanel } from '../components/business/chat/AIChatPanel';
import { useAIChat } from '../contexts/AIChatContext';
import { SparkIcon, QuillIcon } from '../components/business/shared/Icons';
import { createProject, initializeProjectWorld } from '../api/projects';
import type { AppLayoutContext } from '../layouts/AppLayout';

export function NewBookPage() {
  const navigate = useNavigate();
  const ctx = useOutletContext<AppLayoutContext>();
  const { setPageContext, setOnBookCreated } = useAIChat();

  const [name, setName] = useState('');
  const [genre, setGenre] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPageContext({
      label: '创建新书籍',
      pageKey: 'books',
      recommendedAgentHint: '导演',
      agentLocked: true,
    });
    return () => setPageContext(null);
  }, [setPageContext]);

  useEffect(() => {
    setOnBookCreated((bookId: string, conversationId?: string | null) => {
      void ctx.refreshProjects();
      navigate(`/books/${bookId}`, {
        state: {
          fromAICreation: true,
          conversationId: conversationId ?? null,
          agentId: 'preset-director',
          continuationMessage: '书籍已创建。请在当前书籍工作台上下文中继续，先给出下一步创作计划并开始执行。',
        },
      });
    });
    return () => setOnBookCreated(null);
  }, [navigate, setOnBookCreated, ctx.refreshProjects]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleManualCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const data = await createProject({
        name: name.trim(),
        genre: genre.trim() || null,
        synopsis: synopsis.trim() || null,
      });
      void initializeProjectWorld(data.project.id).catch(() => void 0);
      await ctx.refreshProjects();
      navigate(`/books/${data.project.id}/overview`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex-1 bg-background text-foreground h-screen overflow-hidden flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="mb-8">
            <h1 className="text-3xl text-foreground leading-tight mb-2">
              创建新书籍
            </h1>
            <p className="text-muted-foreground text-sm">
              选择创建方式，开始你的创作之旅
            </p>
          </div>

          <Tabs defaultValue="manual" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="manual" className="flex items-center gap-2">
                <QuillIcon />
                <span>手动创建</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className="flex items-center gap-2">
                <SparkIcon />
                <span>AI 创建</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual">
              <Card className="mt-4">
                <CardContent className="pt-6">
                  <form onSubmit={(e) => void handleManualCreate(e)} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="book-name">
                        书名 <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="book-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="输入书籍名称"
                        required
                        autoFocus
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="book-genre">类型</Label>
                      <Input
                        id="book-genre"
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        placeholder="例如：玄幻、都市、科幻、悬疑…"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="book-synopsis">简介</Label>
                      <Textarea
                        id="book-synopsis"
                        value={synopsis}
                        onChange={(e) => setSynopsis(e.target.value)}
                        placeholder="简要描述故事梗概…"
                        rows={4}
                        className="resize-none"
                      />
                    </div>

                    {error && (
                      <p className="text-destructive text-sm">{error}</p>
                    )}

                    <div className="flex justify-end">
                      <Button type="submit" disabled={!name.trim() || isSubmitting}>
                        {isSubmitting ? '创建中…' : '创建书籍'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ai">
              <Card className="mt-4 overflow-hidden">
                <CardContent className="p-0 h-[500px]">
                  <AIChatPanel />
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                描述你的创作想法，AI 将帮你构思并创建书籍
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}
