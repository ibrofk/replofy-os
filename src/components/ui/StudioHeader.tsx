import React, { lazy, Suspense } from 'react';

const NotificationBell = lazy(() =>
  import('../NotificationBell').then((module) => ({ default: module.NotificationBell })),
);

export function StudioHeader({
  badge,
  badgeIcon,
  title,
  subtitle,
  leftAction,
  actions,
  showNotifications = true,
}: {
  badge: string;
  badgeIcon: React.ReactNode;
  title: string;
  subtitle?: string;
  leftAction?: React.ReactNode;
  actions?: React.ReactNode;
  showNotifications?: boolean;
}) {
  return (
    <div className="relative z-10 border-b border-zinc-200 bg-white/50 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
      <div className="flex items-start gap-3">
        {leftAction}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500 mb-2">
            {badgeIcon}
            {badge}
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-zinc-950">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
        {actions}
        {showNotifications && (
          <Suspense fallback={null}>
            <NotificationBell />
          </Suspense>
        )}
      </div>
    </div>
  );
}
