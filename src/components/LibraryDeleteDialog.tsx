import React, { useEffect, useRef } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';

type LibraryDeleteDialogProps = {
  open: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  deletingLabel: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export const LibraryDeleteDialog: React.FC<LibraryDeleteDialogProps> = ({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  deletingLabel,
  deleting,
  onCancel,
  onConfirm,
}) => {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const cancelHandler = useRef(onCancel);
  const deletingState = useRef(deleting);

  useEffect(() => { cancelHandler.current = onCancel; }, [onCancel]);
  useEffect(() => { deletingState.current = deleting; }, [deleting]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => cancelButton.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deletingState.current) cancelHandler.current();
      if (event.key === 'Tab') {
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.requestAnimationFrame(() => previousFocus.current?.focus());
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !deleting) onCancel();
    }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="library-delete-title" aria-describedby="library-delete-description" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="library-delete-title" className="text-base font-black text-slate-950">{title}</h2>
            <p id="library-delete-description" className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
          </div>
          <button type="button" aria-label={cancelLabel} disabled={deleting} onClick={onCancel} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelButton} type="button" disabled={deleting} onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50">
            {cancelLabel}
          </button>
          <button type="button" disabled={deleting} onClick={onConfirm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-60">
            {deleting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Trash2 aria-hidden="true" className="h-4 w-4" />}
            {deleting ? deletingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
