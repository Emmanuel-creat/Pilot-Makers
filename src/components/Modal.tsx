"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

/** Fenêtre modale accessible basée sur l'élément dialog natif. */
export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-lg"} rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40`}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-semibold">{title}</h2>
            <button type="button" className="btn-ghost min-h-8 px-2" onClick={onClose} aria-label="Fermer">
              <Icon name="x" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
