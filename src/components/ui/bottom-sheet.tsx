'use client';

import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * Accessible bottom sheet built on the native <dialog> element
 * (focus trapping, Escape to close, inert background).
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  dismissible = true,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  dismissible?: boolean;
  className?: string;
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
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose();
      }}
      className="fixed inset-x-0 bottom-0 mx-auto mt-auto mb-0 w-full max-w-[430px] max-h-[92dvh] bg-transparent p-0 text-ink"
    >
      {open && (
        <div className={cn('animate-sheet-up rounded-t-[28px] bg-surface px-5 pt-3 pb-6 safe-bottom shadow-[var(--shadow-sheet)]', className)}>
          <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-line" aria-hidden />
          {title && (
            <h2 id={titleId} className="text-lg font-bold">
              {title}
            </h2>
          )}
          {description && (
            <div id={descriptionId} className="mt-1.5 text-sm leading-7 text-muted">
              {description}
            </div>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}
