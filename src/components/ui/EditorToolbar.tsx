import React from 'react';

export function EditorToolbar({
  title,
  badge,
  leftActions,
  rightActions,
}: {
  title?: string;
  badge?: string;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-3 border-b border-zinc-200 bg-white sticky top-0 z-10 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        {leftActions}
        {badge && (
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.24em] bg-zinc-50 px-2 py-1 rounded-sm border border-zinc-200 shadow-sm">
            {badge}
          </span>
        )}
        {title && (
          <span className="text-sm font-semibold text-zinc-900">{title}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {rightActions}
      </div>
    </div>
  );
}
