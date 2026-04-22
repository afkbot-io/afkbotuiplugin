import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type AsyncButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  idleLabel: ReactNode;
  loading?: boolean;
  pendingLabel: ReactNode;
};

export const AsyncButton = forwardRef<HTMLButtonElement, AsyncButtonProps>(function AsyncButton(
  {
    className = "",
    disabled = false,
    idleLabel,
    loading = false,
    pendingLabel,
    type = "button",
    ...props
  },
  ref,
) {
  const busy = Boolean(loading);

  return (
    <button
      {...props}
      aria-busy={busy || undefined}
      className={`${className} async-button${busy ? " async-button--loading" : ""}`.trim()}
      disabled={busy || disabled}
      ref={ref}
      type={type}
    >
      {busy ? <span aria-hidden="true" className="spinner spinner--inline async-button__spinner" /> : null}
      <span className="async-button__label">{busy ? pendingLabel : idleLabel}</span>
    </button>
  );
});
