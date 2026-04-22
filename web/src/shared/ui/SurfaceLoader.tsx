import { RabbitMascot } from "@/shared/ui/branding/RabbitMascot";

type SurfaceLoaderProps = {
  center?: boolean;
  messageClassName?: string;
  message: string;
  title?: string;
  variant?: "inline" | "panel";
};

export function SurfaceLoader({
  center = false,
  messageClassName = "",
  message,
  title,
  variant = "panel",
}: SurfaceLoaderProps) {
  if (variant === "inline") {
    return (
      <div className="status-line status-line--info surface-loader surface-loader--inline" role="status">
        <span aria-hidden="true" className="surface-loader__inline-signal">
          <span className="surface-loader__inline-dot" />
          <span className="surface-loader__inline-dot surface-loader__inline-dot--delay" />
        </span>
        <span>{message}</span>
      </div>
    );
  }

  return (
      <div className={`surface-loader surface-loader--panel${center ? " surface-loader--centered" : ""}`} role="status">
        <div className="loading-panel loading-panel--rich surface-loader__panel-shell">
          <div aria-hidden="true" className="surface-loader__orbital">
            <span className="surface-loader__ring surface-loader__ring--outer" />
            <span className="surface-loader__ring surface-loader__ring--inner" />
            <span className="surface-loader__ring surface-loader__ring--halo" />
            <span className="surface-loader__signal" />
            <RabbitMascot className="surface-loader__rabbit" size={76} variant="default" />
          </div>
          <div className="surface-loader__console">
            <div className="surface-loader__console-head">
              <span className="surface-loader__console-label">runtime sync</span>
              <span className="surface-loader__console-status">live</span>
            </div>
            <div className="surface-loader__console-body">
              {title ? <h3>{title}</h3> : null}
              <p className={messageClassName}>{message}</p>
              <div aria-hidden="true" className="surface-loader__progress">
                <span className="surface-loader__progress-bar" />
              </div>
            <div aria-hidden="true" className="surface-loader__skeleton">
              <span className="surface-loader__line surface-loader__line--lg" />
              <span className="surface-loader__line" />
              <span className="surface-loader__line surface-loader__line--sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
