import React from 'react';

export function DashboardCard({
  title,
  subtitle,
  icon,
  badge,
  children,
  className = '',
  noPadding = false,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.24em] text-zinc-400">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {badge}
          {icon && <div className="text-zinc-400">{icon}</div>}
        </div>
      </div>
      {noPadding ? children : <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}
