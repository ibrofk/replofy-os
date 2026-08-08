import React from 'react';

export function SectionHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="border-b border-zinc-200 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.24em] text-zinc-400">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
        </div>
        {icon && <div className="text-zinc-400">{icon}</div>}
      </div>
    </div>
  );
}
