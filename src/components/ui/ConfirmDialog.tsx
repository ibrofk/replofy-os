import React, { useState } from 'react';
import { Modal } from './Modal';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (confirmError) {
      const message = confirmError instanceof Error ? confirmError.message : 'This action could not be completed.';
      setError(message);
    } finally {
      setPending(false);
    }
  };

  const handleClose = () => {
    if (pending) return;
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={handleClose}
      footer={(
        <>
          <button disabled={pending} onClick={handleClose} className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-700 disabled:opacity-50">
            {cancelLabel}
          </button>
          <button
            disabled={pending}
            onClick={() => void handleConfirm()}
            className={`rounded-full px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-zinc-950 hover:bg-zinc-800'}`}
          >
            {pending ? 'Working...' : confirmLabel}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm leading-6 text-zinc-600">{description}</div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold leading-5 text-red-700">{error}</div>}
      </div>
    </Modal>
  );
}
