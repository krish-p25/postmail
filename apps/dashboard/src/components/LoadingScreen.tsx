import { useState, useEffect, useRef } from 'react';

/**
 * Full-page loading screen with PostMail logo and glare animation.
 * Fades out over 0.5s when `visible` changes to false, then unmounts.
 */
export default function LoadingScreen({ message, visible = true }: { message?: string; visible?: boolean }) {
  const [mounted, setMounted] = useState(true);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible && !fading) {
      setFading(true);
      timerRef.current = setTimeout(() => setMounted(false), 500);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-gray-50 transition-opacity duration-500 ${fading ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      <div className="text-center">
        <div className="relative inline-block overflow-hidden rounded px-1">
          <span className="text-3xl font-extrabold tracking-tight text-gray-900">
            Post<span className="text-primary-500">Mail</span>
          </span>
          <div
            className="pointer-events-none absolute top-0 h-full w-full animate-glare"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255), transparent)',
            }}
          />
        </div>
        {message && <p className="mt-3 text-sm text-gray-500">{message}</p>}
      </div>
    </div>
  );
}
