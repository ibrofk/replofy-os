import React from 'react';

type InputVariant = 'full' | 'underline' | 'search';

export function Input({
  variant = 'full',
  className = '',
  leftIcon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: InputVariant;
  leftIcon?: React.ReactNode;
}) {
  const baseClasses = 'w-full bg-transparent py-3 text-lg font-medium text-zinc-900 placeholder:text-zinc-300 focus:outline-none transition-colors';

  const variantClasses = {
    full: 'border border-zinc-200 rounded-lg px-4 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10',
    underline: 'border-b border-zinc-200 focus:border-zinc-900',
    search: 'bg-zinc-50 border border-zinc-200 focus:border-zinc-400 focus:bg-white rounded-lg py-2 pl-9 pr-4 text-sm font-medium placeholder:text-zinc-400',
  };

  return (
    <div className="relative w-full">
      {leftIcon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
          {leftIcon}
        </div>
      )}
      <input
        className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        {...props}
      />
    </div>
  );
}
