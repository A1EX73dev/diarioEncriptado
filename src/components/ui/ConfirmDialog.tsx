"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "./Button";

/**
 * Diálogo de confirmación con <dialog> nativo: atrapa el foco, se cierra con
 * Escape y devuelve el foco al elemento que lo abrió.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-lg border border-border bg-surface p-6 text-text backdrop:bg-black/50"
    >
      <h2 id={titleId} className="font-serif text-xl">
        {title}
      </h2>
      <p id={descriptionId} className="mt-2 text-sm text-text-muted">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} autoFocus>
          Cancelar
        </Button>
        <Button variant="danger" onClick={onConfirm} pending={pending} pendingLabel="Un momento…">
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
