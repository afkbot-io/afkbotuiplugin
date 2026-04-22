import { useId, useRef, type FormEvent, type ReactNode } from "react";

import { useDialogFocusTrap } from "@/shared/hooks/use-dialog-focus-trap";

type ModalDialogProps = {
  busy?: boolean;
  children: ReactNode;
  className?: string;
  closeLabel: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  onClose: () => void;
  onSubmit?: () => void;
  open: boolean;
  title: ReactNode;
  wide?: boolean;
};

export function ModalDialog({
  busy = false,
  children,
  className = "",
  closeLabel,
  description,
  eyebrow,
  onClose,
  onSubmit,
  open,
  title,
  wide = false,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDivElement | HTMLFormElement | null>(null);
  const titleId = useId();

  const handleClose = () => {
    if (busy) {
      return;
    }
    onClose();
  };

  const handleKeyDown = useDialogFocusTrap({
    containerRef: dialogRef,
    onClose: handleClose,
    open,
  });

  if (!open) {
    return null;
  }

  const dialogClassName = `modal-card${wide ? " modal-card--wide" : ""}${className ? ` ${className}` : ""}`;
  const header = (
    <div className="modal-card__head">
      <div>
        {eyebrow ? <p className="surface-page__eyebrow">{eyebrow}</p> : null}
        <h3 id={titleId}>{title}</h3>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      <button
        aria-label={closeLabel}
        className="icon-button"
        disabled={busy}
        onClick={handleClose}
        type="button"
      >
        ×
      </button>
    </div>
  );

  if (onSubmit) {
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSubmit();
    };

    return (
      <div className="modal-root modal-root--open">
        <div className="modal-overlay" onClick={handleClose} />
        <form
          aria-labelledby={titleId}
          aria-modal="true"
          className={dialogClassName}
          onKeyDown={handleKeyDown}
          onSubmit={handleSubmit}
          ref={(node) => {
            dialogRef.current = node;
          }}
          role="dialog"
          tabIndex={-1}
        >
          {header}
          {children}
        </form>
      </div>
    );
  }

  return (
    <div className="modal-root modal-root--open">
      <div className="modal-overlay" onClick={handleClose} />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={dialogClassName}
        onKeyDown={handleKeyDown}
        ref={(node) => {
          dialogRef.current = node;
        }}
        role="dialog"
        tabIndex={-1}
      >
        {header}
        {children}
      </div>
    </div>
  );
}
