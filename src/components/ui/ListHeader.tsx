import React from 'react';

export function ListHeader({
  columns,
}: {
  columns: { label: string; width?: string; sortable?: boolean }[];
}) {
  return (
    <div className="flex items-center px-4 py-2 border-b border-zinc-100 bg-zinc-50/50 text-xs font-semibold text-zinc-500 sticky top-0 z-10 w-full select-none">
      {columns.map((col, i) => (
        <div
          key={i}
          className={`${col.width || 'flex-1'} ${col.sortable ? 'cursor-pointer hover:text-zinc-800 transition' : ''}`}
        >
          {col.label}
        </div>
      ))}
    </div>
  );
}
