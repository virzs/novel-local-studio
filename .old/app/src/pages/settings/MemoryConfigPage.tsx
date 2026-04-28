import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ModelPicker } from '../../components/business/chat/ModelPicker';
import { getSettings, updateSetting, listProviders } from '../../api';
import type { Provider } from '../../types';

type EmbedderType = 'local' | 'remote';

export function MemoryConfigPage() {
  const [embedderType, setEmbedderType] = useState<EmbedderType>('local');
  const [embedderModel, setEmbedderModel] = useState('');
  const [omModel, setOmModel] = useState('');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const hasProviders = providers.some((p) => p.enabled === 1);

  useEffect(() => {
    async function load() {
      try {
        const [settingsData, providersData] = await Promise.all([
          getSettings(),
          listProviders(),
        ]);
        const em = settingsData.settings['memory.embedder_model'] ?? '';
        const om = settingsData.settings['memory.om_model'] ?? '';
        setOmModel(om);
        setProviders(providersData.providers ?? []);
        setEmbedderModel(em);
        setEmbedderType(em ? 'remote' : 'local');
        setLoadError(null);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function handleEmbedderTypeChange(type: EmbedderType) {
    setEmbedderType(type);
    if (type === 'local') setEmbedderModel('');
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const modelValue = embedderType === 'local' ? null : (embedderModel.trim() || null);
      await Promise.all([
        updateSetting('memory.embedder_model', modelValue),
        updateSetting('memory.om_model', omModel.trim() || null),
      ]);
      setSaveMessage({ type: 'success', text: '已保存，重启应用后生效' });
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : '保存失败' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中…</p>;
  }

  if (loadError) {
    return <p className="text-destructive text-sm">{loadError}</p>;
  }

  return (
    <div className="max-w-lg space-y-8">
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-foreground mb-1">Embedding 模型</h3>
          <p className="text-xs text-muted-foreground mb-3">
            用于语义召回的向量化模型。本地模式无需联网，远程模式需配置对应服务商。
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="embedderType"
                value="local"
                checked={embedderType === 'local'}
                onChange={() => handleEmbedderTypeChange('local')}
                className="accent-primary"
              />
              <span className="text-sm">本地 (fastembed，离线可用)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="embedderType"
                value="remote"
                checked={embedderType === 'remote'}
                onChange={() => handleEmbedderTypeChange('remote')}
                className="accent-primary"
              />
              <span className="text-sm">远程模型</span>
            </label>
          </div>

          {embedderType === 'remote' && (
            <div className="mt-3 space-y-3">
              {hasProviders ? (
                <div className="space-y-1">
                  <Label className="text-xs">从已配置服务商选择</Label>
                  <ModelPicker
                    providers={providers}
                    value={embedderModel}
                    onChange={setEmbedderModel}
                    placeholder="选择模型…"
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  暂无已配置服务商的模型，请手动输入或先在服务商配置中添加服务商。
                </p>
              )}
              <div className="space-y-1">
                <Label htmlFor="embedder-model" className="text-xs">
                  模型 ID（格式：provider/model）
                </Label>
                <Input
                  id="embedder-model"
                  value={embedderModel}
                  onChange={(e) => setEmbedderModel(e.target.value)}
                  placeholder="openai/text-embedding-3-small"
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          OM 后台模型
          <span className="text-xs text-muted-foreground font-normal ml-1">（Phase 2 预览）</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          Observational Memory 使用的压缩模型，建议选用低成本高速模型。Phase 2 启用后生效。
        </p>
        <Label htmlFor="om-model" className="text-xs">
          模型 ID（格式：provider/model）
        </Label>
        <Input
          id="om-model"
          value={omModel}
          onChange={(e) => setOmModel(e.target.value)}
          placeholder="google/gemini-2.5-flash"
          className="font-mono text-sm"
        />
      </div>

      <div className="flex items-center gap-4">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
        {saveMessage && (
          <p className={`text-sm ${saveMessage.type === 'success' ? 'text-success' : 'text-destructive'}`}>
            {saveMessage.text}
          </p>
        )}
      </div>
    </div>
  );
}
