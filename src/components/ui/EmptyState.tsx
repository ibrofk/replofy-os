import React from 'react';

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="py-20 flex flex-col items-center justify-center text-center px-4">
      <div className="w-12 h-12 rounded-full border border-zinc-200 flex items-center justify-center mb-4 bg-zinc-50">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-zinc-900">{title}</h3>
      {subtitle && <p className="text-xs text-zinc-500 mt-1 max-w-xs">{subtitle}</p>}
    </div>
  );
}
