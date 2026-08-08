import React from 'react';
import { X } from 'lucide-react';

type DrawerProps = {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
};

export function Drawer({ open, title, description, children, onClose, footer }: DrawerProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-zinc-950/30" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-base font-black text-zinc-950">{title}</h2>
            {description && <p className="mt-1 text-sm leading-5 text-zinc-500">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-4">{footer}</div>}
      </aside>
    </div>
  );
}
