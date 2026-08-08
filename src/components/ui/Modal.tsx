import React from 'react';
import { X } from 'lucide-react';

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
};

export function Modal({ open, title, description, children, onClose, footer }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/35 px-4 py-6">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-base font-black text-zinc-950">{title}</h2>
            {description && <p className="mt-1 text-sm leading-5 text-zinc-500">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
