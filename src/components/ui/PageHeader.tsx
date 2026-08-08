import React from 'react';
import { NotificationBell } from '../NotificationBell';

export function PageHeader({
  badge,
  badgeIcon,
  title,
  subtitle,
  actions,
  metrics,
}: {
  badge?: string;
  badgeIcon?: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  metrics?: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-4">
          {badge && (
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
              {badgeIcon}
              {badge}
            </div>
          )}
          <div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-zinc-950">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 max-w-2xl text-sm md:text-base leading-relaxed text-zinc-500">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        <div className="flex items-start gap-3">
          {metrics && <div className="grid grid-cols-2 gap-3 lg:w-[360px]">{metrics}</div>}
          <NotificationBell className="shrink-0" />
        </div>
      </div>
    </section>
  );
}
