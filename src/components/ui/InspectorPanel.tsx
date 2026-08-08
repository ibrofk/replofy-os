import React from 'react';

export function InspectorPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="hidden lg:flex flex-col w-[300px] bg-zinc-50 shrink-0 overflow-y-auto">
      <div className="px-5 py-4 border-b border-zinc-200 sticky top-0 bg-zinc-50 z-10">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-600 flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {title}
        </h3>
      </div>
      <div className="p-5 space-y-6">
        {children}
      </div>
    </div>
  );
}
