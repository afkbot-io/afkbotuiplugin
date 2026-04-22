import type { ReactNode } from "react";

type PageHeaderProps = {
  actions?: ReactNode;
  actionsClassName?: string;
  className?: string;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
};

export function PageHeader({
  actions,
  actionsClassName = "",
  className = "",
  eyebrow,
  subtitle,
  title,
}: PageHeaderProps) {
  return (
    <div className={`section-head page-header${className ? ` ${className}` : ""}`}>
      <div className="page-header__copy">
        {eyebrow ? <p className="task-pane__eyebrow page-header__eyebrow">{eyebrow}</p> : null}
        <h2 className="section-title page-header__title">{title}</h2>
        {subtitle ? <p className="section-copy page-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className={`section-actions page-header__actions${actionsClassName ? ` ${actionsClassName}` : ""}`}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
