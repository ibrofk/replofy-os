import React from 'react';

type BadgeVariant = 'default' | 'pill' | 'square';

export function Badge({
  children,
  variant = 'pill',
  className = '',
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  const baseClasses = 'inline-flex items-center font-bold uppercase text-zinc-600';

  const variantClasses = {
    pill: 'rounded-full px-2.5 py-1 text-[10px] tracking-[0.24em] border border-zinc-200 bg-zinc-50',
    square: 'rounded-sm px-1.5 py-0.5 text-[10px] tracking-[0.24em] border border-zinc-200 bg-zinc-50',
    default: 'rounded-full px-2.5 py-1 text-[10px] tracking-[0.24em] border border-zinc-200 bg-zinc-50',
  };

  return (
    <span className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}
