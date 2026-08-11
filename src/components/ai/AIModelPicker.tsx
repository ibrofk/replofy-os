import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react';
import type { AIProviderId, AIProviderModel } from '../../services/standaloneClient';

const PREFERRED_MODEL_LABELS: Partial<Record<AIProviderId, Record<string, string>>> = {
  openai: { 'gpt-5.6-luna': 'GPT 5.6 Luna' },
  gemini: {
    'gemini-3.6-flash-lite': 'Gemini 3.6 Flash Lite',
    'gemini-3.6-flash-lite-preview': 'Gemini 3.6 Flash Lite Preview',
  },
  anthropic: { 'claude-haiku-latest': 'Claude Haiku (latest)' },
};

function isPreferredModel(provider: AIProviderId, modelId: string) {
  return Object.prototype.hasOwnProperty.call(PREFERRED_MODEL_LABELS[provider] || {}, modelId.toLowerCase());
}

export function AIModelPicker({
  provider,
  models,
  value,
  onChange,
  loading = false,
  disabled = false,
  onRefresh,
  emptyLabel = 'Save a provider key to discover available models.',
}: {
  provider?: AIProviderId;
  models: AIProviderModel[];
  value: string;
  onChange: (model: string) => void;
  loading?: boolean;
  disabled?: boolean;
  onRefresh?: () => void;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const effectiveProvider = provider || (value.toLowerCase().startsWith('gemini') ? 'gemini' : value.toLowerCase().startsWith('claude') ? 'anthropic' : 'openai');

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const options = useMemo(() => {
    if (value && !models.some((model) => model.id === value)) {
      return [{ id: value, label: PREFERRED_MODEL_LABELS[effectiveProvider]?.[value.toLowerCase()] || `${value} (saved)`, description: isPreferredModel(effectiveProvider, value) ? 'Preferred workspace model. The provider did not include this alias in the latest discovery response, so it is kept as the saved selection.' : 'The currently saved model was not returned by the latest discovery request.', createdAt: null, contextWindow: null, capabilities: [], recommended: isPreferredModel(effectiveProvider, value) }, ...models];
    }
    return models;
  }, [effectiveProvider, models, value]);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((model) => `${model.id} ${model.label} ${model.description || ''}`.toLowerCase().includes(normalized));
  }, [options, query]);

  const selected = options.find((model) => model.id === value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm outline-none transition hover:border-zinc-400 focus:border-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-400"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-zinc-900">{selected?.label || (loading ? 'Discovering models…' : 'Choose a discovered model')}</span>
          <span className="mt-0.5 block truncate text-xs text-zinc-500">{selected?.id || 'Models are loaded from the provider API'}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full min-w-[280px] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/10">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-1 pb-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models"
                className="w-full rounded-lg border border-zinc-200 py-2 pl-8 pr-2 text-xs outline-none focus:border-zinc-500"
                aria-label="Search discovered AI models"
              />
            </div>
            {onRefresh && <button type="button" onClick={onRefresh} disabled={loading} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40" aria-label="Refresh model list"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>}
          </div>
          <div className="max-h-72 overflow-y-auto py-1" role="listbox" aria-label="Discovered AI models">
            {loading && <div className="flex items-center gap-2 px-3 py-6 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Asking the provider for available models…</div>}
            {!loading && filteredOptions.length === 0 && <div className="px-3 py-6 text-xs leading-5 text-zinc-500">{models.length === 0 ? emptyLabel : 'No discovered models match this search.'}</div>}
            {!loading && filteredOptions.map((model) => (
              <button
                type="button"
                key={model.id}
                onClick={() => { onChange(model.id); setOpen(false); setQuery(''); }}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-zinc-50 ${model.id === value ? 'bg-zinc-50' : ''}`}
                role="option"
                aria-selected={model.id === value}
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-zinc-900">{model.id === value && <Check className="h-3 w-3" />}</span>
                <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-900"><span className="truncate">{model.label}</span>{model.recommended && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800"><Sparkles className="h-2.5 w-2.5" /> Recommended</span>}</span><span className="mt-1 block truncate font-mono text-[10px] text-zinc-400">{model.id}</span>{model.description && <span className="mt-1 block text-[11px] leading-4 text-zinc-500">{model.description}</span>}</span>
              </button>
            ))}
          </div>
          {!loading && models.length > 0 && <p className="border-t border-zinc-100 px-2 pt-2 text-[10px] text-zinc-400">{models.length} model{models.length === 1 ? '' : 's'} discovered from this provider.</p>}
        </div>
      )}
    </div>
  );
}
