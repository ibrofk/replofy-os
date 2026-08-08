import React from 'react';

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative w-full ${className}`}>
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors focus:border-zinc-400 focus:bg-white"
      />
    </div>
  );
}
