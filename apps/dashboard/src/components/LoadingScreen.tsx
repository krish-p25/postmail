/**
 * Full-page loading screen with PostMail logo and glare animation.
 * Accepts an optional `message` prop for contextual loading text.
 * Use `inline` prop for in-page loading (no min-h-screen).
 */
export default function LoadingScreen({ message, inline }: { message?: string; inline?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${inline ? 'mt-12' : 'min-h-screen bg-gray-50'}`}>
      <div className="text-center">
        <div className="relative inline-block overflow-hidden">
          <span className="text-3xl font-extrabold tracking-tight text-gray-900">
            Post<span className="text-primary-500">Mail</span>
          </span>
          <div className="pointer-events-none absolute inset-0 animate-glare">
            <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          </div>
        </div>
        {message && <p className="mt-3 text-sm text-gray-500">{message}</p>}
      </div>
    </div>
  );
}
