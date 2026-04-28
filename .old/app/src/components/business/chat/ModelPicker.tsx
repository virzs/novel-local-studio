import * as React from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { SearchIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { Provider } from '../../../types';

export type ModelPickerProps = {
  providers: Provider[];
  value: string;
  onChange: (model: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
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

function isFreeModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('free');
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[-_./\s]/g, '');
}

type ModelGroup = { providerName: string; models: string[] };

function buildGroups(providers: Provider[]): ModelGroup[] {
  return providers
    .filter((p) => p.enabled === 1)
    .map((p) => ({ providerName: p.name, models: parseModels(p.models) }))
    .filter((g) => g.models.length > 0);
}

function filterGroups(groups: ModelGroup[], query: string): ModelGroup[] {
  if (!query.trim()) return groups;
  const q = normalise(query);
  return groups
    .map((g) => ({
      providerName: g.providerName,
      models: g.models.filter(
        (m) => normalise(m).includes(q) || normalise(g.providerName).includes(q),
      ),
    }))
    .filter((g) => g.models.length > 0);
}

function deriveDisplayLabel(value: string): string {
  if (!value) return '';
  return value.includes('/') ? value.split('/').slice(1).join('/') : value;
}

function ModelItemList({
  groups,
  value,
  onSelect,
}: {
  groups: ModelGroup[];
  value: string;
  onSelect: (fullPath: string) => void;
}) {
  if (groups.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">无匹配模型</p>;
  }
  return (
    <>
      {groups.map((group) => (
        <div key={group.providerName}>
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{group.providerName}</p>
          {group.models.map((model) => {
            const fullValue = `${group.providerName}/${model}`;
            const isSelected = value === fullValue;
            return (
              <button
                key={model}
                type="button"
                onClick={() => onSelect(fullValue)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors text-left',
                  isSelected
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <span className="flex-1 truncate">{model}</span>
                {isFreeModel(model) && (
                  <span className="shrink-0 rounded border border-green-500/50 px-1 py-0.5 text-[10px] leading-none text-green-600 dark:text-green-400">
                    免费
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

function SearchableContent({
  groups,
  value,
  onSelect,
  inputRef,
}: {
  groups: ModelGroup[];
  value: string;
  onSelect: (fullPath: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = React.useState('');
  const filtered = React.useMemo(() => filterGroups(groups, query), [groups, query]);

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索模型"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1">
        <ModelItemList groups={filtered} value={value} onSelect={onSelect} />
      </div>
    </>
  );
}

export function ModelPicker({
  providers,
  value,
  onChange,
  placeholder = '选择模型',
  className,
  disabled = false,
}: ModelPickerProps) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const groups = React.useMemo(() => buildGroups(providers), [providers]);

  const displayLabel = deriveDisplayLabel(value);

  function handleSelect(fullPath: string) {
    onChange(fullPath);
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none h-9',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('truncate', !displayLabel && 'text-muted-foreground')}>
            {displayLabel || placeholder}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'z-50 w-[var(--radix-popover-trigger-width)] min-w-56 rounded-md border bg-popover text-popover-foreground shadow-md',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
        >
          <SearchableContent
            groups={groups}
            value={value}
            onSelect={handleSelect}
            inputRef={inputRef}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function ModelPickerCompact({
  providers,
  value,
  onChange,
  placeholder = '模型',
  className,
  disabled = false,
}: ModelPickerProps) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const groups = React.useMemo(() => buildGroups(providers), [providers]);

  const displayLabel = deriveDisplayLabel(value) || value;

  function handleSelect(fullPath: string) {
    onChange(fullPath);
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex items-center gap-1 rounded border border-input bg-transparent px-2 text-xs h-6 transition-colors outline-none',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'disabled:cursor-not-allowed disabled:opacity-50 hover:border-primary/40',
            'max-w-[120px]',
            className,
          )}
        >
          <span className="truncate">{displayLabel || placeholder}</span>
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="end"
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'z-50 w-64 rounded-md border bg-popover text-popover-foreground shadow-md',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
        >
          <SearchableContent
            groups={groups}
            value={value}
            onSelect={handleSelect}
            inputRef={inputRef}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
