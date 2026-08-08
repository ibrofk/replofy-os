import React from 'react';

export function FilterSelect({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 px-3 text-xs font-bold text-zinc-700 outline-none transition-colors hover:bg-zinc-100 focus:border-zinc-400 cursor-pointer ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
