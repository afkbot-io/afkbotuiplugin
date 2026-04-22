import { useId } from "react";

type RabbitMascotProps = {
  className?: string;
  size?: number;
  variant?: "default" | "glasses" | "small";
};

export function RabbitMascot({
  className = "",
  size = 260,
  variant = "default",
}: RabbitMascotProps) {
  const gradientId = useId().replace(/:/g, "");
  const bodyGradientId = `${gradientId}-body`;
  const earGradientId = `${gradientId}-ear`;
  const shadowGradientId = `${gradientId}-shadow`;

  return (
    <svg
      aria-hidden="true"
      className={`rabbit-svg ${className}`.trim()}
      height={size * (460 / 400)}
      viewBox="0 0 400 460"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={bodyGradientId} cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#f5f5f7" />
          <stop offset="60%" stopColor="#c8ccd4" />
          <stop offset="100%" stopColor="#7b8091" />
        </radialGradient>
        <radialGradient id={earGradientId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd1c4" />
          <stop offset="100%" stopColor="#f1958a" />
        </radialGradient>
        <linearGradient id={shadowGradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
        </linearGradient>
      </defs>

      <g className="r-ear r-ear-left">
        <ellipse cx="130" cy="95" fill={`url(#${bodyGradientId})`} rx="28" ry="80" />
        <ellipse
          cx="130"
          cy="100"
          fill={`url(#${earGradientId})`}
          opacity="0.85"
          rx="14"
          ry="60"
        />
      </g>
      <g className="r-ear r-ear-right">
        <ellipse cx="265" cy="95" fill={`url(#${bodyGradientId})`} rx="28" ry="80" />
        <ellipse
          cx="265"
          cy="100"
          fill={`url(#${earGradientId})`}
          opacity="0.85"
          rx="14"
          ry="60"
        />
      </g>

      <ellipse cx="200" cy="360" fill={`url(#${bodyGradientId})`} rx="150" ry="90" />
      <ellipse cx="200" cy="240" fill={`url(#${bodyGradientId})`} rx="120" ry="110" />

      <ellipse cx="150" cy="280" fill="#ffffff" opacity="0.35" rx="30" ry="20" />
      <ellipse cx="250" cy="280" fill="#ffffff" opacity="0.35" rx="30" ry="20" />

      {variant === "glasses" ? (
        <g className="r-glasses" fill="none" stroke="#0b0d14" strokeWidth="6">
          <circle cx="160" cy="235" fill="rgba(42,124,255,0.08)" r="30" />
          <circle cx="240" cy="235" fill="rgba(42,124,255,0.08)" r="30" />
          <line x1="190" x2="210" y1="235" y2="235" />
          <line x1="130" x2="110" y1="230" y2="225" />
          <line x1="270" x2="290" y1="230" y2="225" />
        </g>
      ) : null}

      <g className="r-eyes">
        <circle cx="160" cy="235" fill="#0b0d14" r="6" />
        <circle cx="240" cy="235" fill="#0b0d14" r="6" />
        <circle cx="162" cy="232" fill="#fff" r="2" />
        <circle cx="242" cy="232" fill="#fff" r="2" />
      </g>

      <path className="r-nose" d="M195 275 Q200 282 205 275 Q200 285 195 275 Z" fill="#ff8a4c" />
      <path
        d="M200 285 Q195 295 188 293"
        fill="none"
        stroke="#0b0d14"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
      <path
        d="M200 285 Q205 295 212 293"
        fill="none"
        stroke="#0b0d14"
        strokeLinecap="round"
        strokeWidth="2.5"
      />

      <ellipse cx="200" cy="430" fill={`url(#${shadowGradientId})`} rx="140" ry="14" />
    </svg>
  );
}
