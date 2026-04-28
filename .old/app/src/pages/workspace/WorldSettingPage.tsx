import { useState } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import type { WorldSetting } from '../../types';
import { createWorldSetting, updateWorldSetting } from '../../api';
import { ChevronLeftIcon } from '../../components/business/shared/Icons';
import { useAIChat } from '../../contexts/AIChatContext';

type FormData = { title: string; summary: string; content: string; tags: string };

function parseTags(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export function WorldSettingPage() {
  const { bookId, settingId } = useParams<{ bookId: string; settingId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { setPendingMessage } = useAIChat();
  const isNew = !settingId;

  const locationState = location.state as { setting?: WorldSetting } | null;
  const existingSetting = locationState?.setting;
  const typeId = isNew
    ? (searchParams.get('typeId') ?? '')
    : (existingSetting?.typeId ?? '');

  const [form, setForm] = useState<FormData>({
    title: existingSetting?.title ?? '',
    summary: existingSetting?.summary ?? '',
    content: existingSetting?.content ?? '',
    tags: existingSetting ? parseTags(existingSetting.tags).join(', ') : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goBack() {
    navigate(`/books/${bookId}/world`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('标题为必填项'); return; }
    setSaving(true); setError(null);
    const tagsArray = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    try {
      const input = {
        title: form.title.trim(),
        summary: form.summary.trim() || null,
        content: form.content,
        tags: JSON.stringify(tagsArray),
        typeId,
      };
      if (!isNew && settingId) {
        await updateWorldSetting(settingId, input);
      } else {
        await createWorldSetting(bookId!, input);
      }
      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Button type="button" variant="ghost" size="icon" onClick={goBack}>
          <ChevronLeftIcon />
        </Button>
        <h2 className="text-base font-medium text-foreground">
          {isNew ? '新建设定' : '编辑设定'}
        </h2>
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <Label>标题 <span className="text-destructive">*</span></Label>
          <Input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="设定名称，如：「法力等级划分」"
            autoFocus
          />
        </div>
        <div>
          <Label>
            摘要
            <span className="ml-2 text-xs text-muted-foreground font-normal">（AI 优先读取，简短描述核心要点）</span>
          </Label>
          <Input
            type="text"
            value={form.summary}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
            placeholder="一句话概括这条设定的核心…"
          />
        </div>
        <div>
          <Label>详细内容</Label>
          <Textarea
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            rows={16}
            placeholder="详细描述这条设定，支持 Markdown…"
          />
        </div>
        <div>
          <Label>
            标签
            <span className="ml-2 text-xs text-muted-foreground font-normal">（英文逗号分隔）</span>
          </Label>
          <Input
            type="text"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="主角, 修仙, 境界…"
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex justify-between gap-3 pt-2">
          <div>
            {!isNew && settingId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const msg = `请根据设定「${form.title}」的最新内容，检查并更新相关章节中与此设定不符的描述。设定摘要：${form.summary || form.content.slice(0, 100)}。设定ID：${settingId}。`;
                  setPendingMessage(msg);
                  navigate(`/books/${bookId}/world`);
                }}
              >
                应用到章节
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={goBack}>取消</Button>
            <Button type="submit" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
