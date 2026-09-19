interface SuccessTickProps {
  /** Starts the stroke-draw once true. */
  active: boolean;
  size?: number;
  label?: string;
}

const CIRCLE_LENGTH = 176; // 2πr for r = 28
const CHECK_LENGTH = 40;

/**
 * Circle-then-check drawn with stroke-dashoffset. Both paths start fully dashed
 * out and transition to 0, so the tick appears to be written rather than faded in.
 */
export default function SuccessTick({ active, size = 56, label = 'Verified' }: SuccessTickProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      className="text-primary-600"
      style={{
        transform: active ? 'scale(1)' : 'scale(0.85)',
        transition: 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <circle
        cx="32"
        cy="32"
        r="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
        style={{
          strokeDasharray: CIRCLE_LENGTH,
          strokeDashoffset: active ? 0 : CIRCLE_LENGTH,
          transition: 'stroke-dashoffset 380ms ease-out',
        }}
      />
      <path
        d="M20 33.5 L28.5 42 L44 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: CHECK_LENGTH,
          strokeDashoffset: active ? 0 : CHECK_LENGTH,
          transition: 'stroke-dashoffset 260ms ease-out 200ms',
        }}
      />
    </svg>
  );
}
