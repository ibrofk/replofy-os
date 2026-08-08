import React from 'react';

export function SegmentedControl({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex p-0.5 bg-zinc-100 rounded-lg overflow-x-auto border border-zinc-200 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${
            value === option.value
              ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/50'
              : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
