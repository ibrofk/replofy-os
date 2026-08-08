import React from 'react';

export function ListItem({
  title,
  subtitle,
  badge,
  badgeVariant = 'default',
  secondaryBadge,
  isActive = false,
  onClick,
  rightAction,
  className = '',
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  secondaryBadge?: string;
  isActive?: boolean;
  onClick: () => void;
  rightAction?: React.ReactNode;
  className?: string;
  key?: React.Key;
}) {
  const badgeColors = {
    default: 'border-zinc-200 bg-zinc-50 text-zinc-600',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-red-200 bg-red-50 text-red-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
  };

  return (
    <button
      onClick={onClick}
      className={`group w-full text-left px-4 py-3 border-b border-zinc-200 transition-colors ${
        isActive
          ? 'bg-white border-l-2 border-l-zinc-900 shadow-sm relative z-10'
          : 'bg-transparent border-l-2 border-l-transparent hover:bg-white'
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className={`text-xs font-semibold truncate ${isActive ? 'text-zinc-900' : 'text-zinc-700'}`}>
          {title}
        </span>
        {rightAction && (
          <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {rightAction}
          </div>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-zinc-500 line-clamp-2 mt-1 mb-2 leading-relaxed font-normal">
          {subtitle}
        </p>
      )}
      {(badge || secondaryBadge) && (
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm border uppercase tracking-[0.24em] ${badgeColors[badgeVariant]}`}>
              {badge}
            </span>
          )}
          {secondaryBadge && (
            <span className="text-[10px] font-mono border border-zinc-200 px-1.5 py-0.5 rounded bg-zinc-50 text-zinc-500">
              {secondaryBadge}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
