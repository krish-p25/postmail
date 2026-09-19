/**
 * Pulsing outline drawn over a section that was deep-linked to (?highlight=...).
 * Purely decorative: it is pointer-events-none and removes itself when the fade ends.
 */
export default function HighlightPing({ onDone, rounded = 'rounded-xl' }: { onDone: () => void; rounded?: string }) {
  return (
    <>
      <style>{`
        /* primary-500 (#f97316), matching the border below. */
        @keyframes highlight-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.5); }
          50% { box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
        }
        @keyframes highlight-fade {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
      <div
        className={`pointer-events-none absolute -inset-0.5 border-2 border-primary-500 ${rounded}`}
        style={{ animation: 'highlight-pulse 1.5s ease-in-out 2, highlight-fade 0.6s ease-out 3s forwards' }}
        onAnimationEnd={(e) => {
          if (e.animationName === 'highlight-fade') onDone();
        }}
      />
    </>
  );
}
