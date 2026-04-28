import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { ModelPicker } from '../../components/business/chat/ModelPicker';
import { listProviders, createAgentConfig, updateAgentConfig } from '../../api';
import type { AgentConfig, Provider } from '../../types';

type AgentFormData = {
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
};

function parseModels(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((m): m is string => typeof m === 'string');
  } catch {
    return [];
  }
  return [];
}

export function AgentFormDialog({
  open,
  onClose,
  agent,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  agent: AgentConfig | null;
  onSaved: () => void;
}) {
  const isEdit = agent !== null;
  const [form, setForm] = useState<AgentFormData>({
    name: '',
    description: '',
    systemPrompt: '',
    model: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);

  useEffect(() => {
    if (!open) return;
    setFormError(null);

    listProviders()
      .then((data) => {
        const list = data.providers ?? [];
        setProviders(list);

        if (agent) {
          const agentModel = agent.model.includes('/')
            ? agent.model
            : agent.provider
              ? `${agent.provider}/${agent.model}`
              : agent.model;
          setForm({
            name: agent.name,
            description: agent.description ?? '',
            systemPrompt: agent.systemPrompt,
            model: agentModel,
          });
        } else {
          const first = list.find((p) => p.enabled === 1) ?? list[0];
          const firstModels = first ? parseModels(first.models) : [];
          const firstModel = firstModels[0] ? `${first!.name}/${firstModels[0]}` : '';
          setForm({
            name: '',
            description: '',
            systemPrompt: '',
            model: firstModel,
          });
        }
      })
      .catch(() => {
        if (agent) {
          const agentModel = agent.model.includes('/')
            ? agent.model
            : agent.provider
              ? `${agent.provider}/${agent.model}`
              : agent.model;
          setForm({
            name: agent.name,
            description: agent.description ?? '',
            systemPrompt: agent.systemPrompt,
            model: agentModel,
          });
        }
      });
  }, [open, agent]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('名称为必填项');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const modelValue = form.model.trim();
      const slashIdx = modelValue.indexOf('/');
      const providerName = slashIdx > -1 ? modelValue.slice(0, slashIdx) : modelValue;
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        systemPrompt: form.systemPrompt,
        provider: providerName,
        model: modelValue,
      };
      if (isEdit) {
        await updateAgentConfig(agent!.id, body);
      } else {
        await createAgentConfig(body);
      }
      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>
            {isEdit ? '编辑智能体' : '新建智能体'}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
            <div>
              <Label className="mb-1.5 block">
                名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="智能体名称"
              />
            </div>

            <div>
              <Label className="mb-1.5 block">描述</Label>
              <Input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="简短描述此智能体的用途"
              />
            </div>

            <div>
              <Label className="mb-1.5 block">System Prompt</Label>
              <Textarea
                value={form.systemPrompt}
                onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                rows={8}
                className="font-mono resize-none max-h-48 overflow-y-auto"
                placeholder="你是一个专业的写作助手…"
              />
            </div>

            <div>
              <Label className="mb-1.5 block">模型</Label>
              <ModelPicker
                providers={providers}
                value={form.model}
                onChange={(m) => setForm((f) => ({ ...f, model: m }))}
                placeholder="选择模型"
              />
            </div>

            {formError && (
              <p className="text-destructive text-sm">{formError}</p>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
