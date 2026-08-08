import React from 'react';

export function FilterBar({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 px-6 py-4 border-b border-zinc-200 bg-white/50 shrink-0 ${className}`}>
      {children}
    </div>
  );
}
