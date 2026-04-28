import { useEffect, useRef, useState } from 'react';
import { RiLoader4Line, RiRefreshLine } from '@remixicon/react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { makeConfigApi } from '../api';

export type TestState = { state: 'idle' | 'running' | 'ok' | 'fail'; msg?: string };

type ModelGroup = { providerId: string; providerLabel: string; models: string[] };

export function ModelCombobox({
  value,
  onChange,
  providerId,
  canFetchModels = true,
  groups,
  onProviderChange,
  api,
  placeholder = '输入或选择模型',
  className,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  providerId?: string;
  canFetchModels?: boolean;
  groups?: ModelGroup[];
  onProviderChange?: (providerId: string) => void;
  api: ReturnType<typeof makeConfigApi>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loadedGroups, setLoadedGroups] = useState<ModelGroup[]>(() => groups ?? []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isMulti = !!groups;

  useEffect(() => {
    if (groups) setLoadedGroups(groups);
  }, [groups]);

  async function fetchModels() {
    if (!canFetchModels) return;
    setLoading(true);
    setLoadError(null);
    try {
      if (isMulti && groups) {
        const results = await Promise.allSettled(
          groups.map((g) => api.listProviderModels(g.providerId)),
        );
        setLoadedGroups(
          groups.map((g, i) => {
            const r = results[i];
            const fetched =
              r.status === 'fulfilled' && r.value.ok ? r.value.models ?? [] : [];
            const merged = Array.from(new Set([...g.models, ...fetched])).sort((a, b) =>
              a.localeCompare(b),
            );
            return { ...g, models: merged };
          }),
        );
      } else if (providerId) {
        const r = await api.listProviderModels(providerId);
        if (r.ok) {
          setLoadedGroups([{ providerId, providerLabel: '', models: r.models ?? [] }]);
        } else {
          setLoadError(r.error ?? '拉取失败');
        }
      }
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const displayGroups: ModelGroup[] = loadedGroups;

  function handleSelect(model: string, pid?: string) {
    onChange(model);
    if (pid && onProviderChange) onProviderChange(pid);
    setSearch('');
    setOpen(false);
  }

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="truncate text-left">{value || placeholder}</span>
            <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
          align="start"
        >
          <Command shouldFilter={false}>
            <div className="relative">
              <CommandInput
                placeholder="搜索或输入模型..."
                value={search}
                onValueChange={setSearch}
              />
              {canFetchModels && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void fetchModels()}
                  disabled={loading}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  aria-label="刷新模型列表"
                >
                  <RiRefreshLine className="size-3.5" />
                </Button>
              )}
            </div>

            {(loading || loadError) && (
              <div className="px-3 py-2 text-xs">
                {loading && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <RiLoader4Line className="size-3.5 animate-spin" />
                    加载中...
                  </span>
                )}
                {loadError && !loading && (
                  <span className="text-destructive">{loadError}</span>
                )}
              </div>
            )}

            <CommandList>
              <CommandEmpty>
                {search ? (
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => handleSelect(search)}
                  >
                    使用 &ldquo;{search}&rdquo;
                  </button>
                ) : (
                  <span className="text-muted-foreground">暂无模型</span>
                )}
              </CommandEmpty>

              {displayGroups
                .map((g) => ({
                  ...g,
                  models: g.models.filter(
                    (m) => !search || m.toLowerCase().includes(search.toLowerCase()),
                  ),
                }))
                .filter((g) => g.models.length > 0)
                .map((g) => (
                  <CommandGroup key={g.providerId} heading={isMulti ? g.providerLabel : undefined}>
                    {g.models.map((m) => (
                      <CommandItem
                        key={`${g.providerId}::${m}`}
                        value={`${g.providerId}::${m}`}
                        onSelect={() => handleSelect(m, isMulti ? g.providerId : undefined)}
                        className={m === value ? 'text-indigo-400' : ''}
                      >
                        {m}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
