import React from 'react';
import { Layers3, Maximize2, Target } from 'lucide-react';
import type { AIContextMode, AIContextStats } from '../../services/standaloneClient';

export const contextModeDetails: Record<AIContextMode, {
  label: string;
  summary: string;
  description: string;
  Icon: typeof Target;
}> = {
  focused: {
    label: 'Focused',
    summary: 'Current surface',
    description: 'A tight evidence set for fast answers and low context cost.',
    Icon: Target,
  },
  workspace: {
    label: 'Workspace',
    summary: 'Linked knowledge',
    description: 'Balances the current surface with relevant memory and workspace sources.',
    Icon: Layers3,
  },
  deep: {
    label: 'Deep',
    summary: 'Wider evidence',
    description: 'Searches more workspace evidence for planning, analysis, and proposals.',
    Icon: Maximize2,
  },
};

export function AIContextModePicker({
  value,
  onChange,
  compact = false,
}: {
  value: AIContextMode;
  onChange: (value: AIContextMode) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'grid grid-cols-3 gap-1.5' : 'grid gap-2 sm:grid-cols-3'} role="radiogroup" aria-label="AI context recipe">
      {(Object.keys(contextModeDetails) as AIContextMode[]).map((mode) => {
        const detail = contextModeDetails[mode];
        const selected = value === mode;
        const Icon = detail.Icon;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            title={`${detail.label}: ${detail.description}`}
            onClick={() => onChange(mode)}
            className={`rounded-xl border text-left transition ${compact ? 'px-2 py-2' : 'p-3'} ${selected ? 'border-zinc-950 bg-zinc-950 text-white shadow-sm' : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50'}`}
          >
            <span className="flex items-center gap-1.5">
              <Icon className={`shrink-0 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${selected ? 'text-amber-300' : 'text-zinc-400'}`} />
              <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold`}>{detail.label}</span>
            </span>
            {!compact && <span className={`mt-1.5 block text-[11px] leading-4 ${selected ? 'text-zinc-300' : 'text-zinc-500'}`}>{detail.summary}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function AIContextStatsSummary({ stats }: { stats?: AIContextStats | null }) {
  if (!stats) return null;
  const mode = contextModeDetails[stats.mode];
  return (
    <p className="text-[11px] leading-5 text-zinc-500">
      Context used · {mode.label} · {stats.memoryCount} memories · {stats.sourceCount} sources
      {stats.conversationMessageCount > 0 ? ` · ${stats.conversationMessageCount} recent messages` : ''}
      {stats.selectedRecordCount > 0 ? ` · ${stats.selectedRecordCount} selected record${stats.selectedRecordCount === 1 ? '' : 's'}` : ''}
    </p>
  );
}
