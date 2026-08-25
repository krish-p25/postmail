import { useState, useEffect } from 'react';

function ExtensionBanner() {
  const [extensionDetected, setExtensionDetected] = useState<boolean | null>(null);

  useEffect(() => {
    // Give the content script a moment to inject the marker
    const timer = setTimeout(() => {
      const installed = document.documentElement.getAttribute('data-postmail-extension') === 'true';
      setExtensionDetected(installed);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  if (extensionDetected !== false) return null;

  return (
    <div className="mb-6 rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-2">
          <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Chrome extension not detected</h3>
          <p className="mt-1 text-sm text-gray-600">
            Install the PostMail Chrome extension to start tracking email opens in Gmail.
          </p>
          <ol className="mt-3 space-y-2 text-sm text-gray-700">
            <li className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">1</span>
              <span>Open <code className="rounded bg-white px-1.5 py-0.5 text-xs text-gray-800 ring-1 ring-gray-200">chrome://extensions</code> in your browser</span>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">2</span>
              <span>Enable <strong className="font-medium text-gray-900">Developer mode</strong> (top-right toggle)</span>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">3</span>
              <span>Click <strong className="font-medium text-gray-900">Load unpacked</strong> and select the <code className="rounded bg-white px-1.5 py-0.5 text-xs text-gray-800 ring-1 ring-gray-200">apps/extension/dist</code> folder</span>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">4</span>
              <span>Refresh this page to confirm detection</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function Emails() {
  return (
    <div className="min-h-screen">
      <ExtensionBanner />
      <h2 className="text-2xl font-bold text-gray-900">Tracked Emails</h2>
      <p className="mt-1 text-sm text-gray-600">
        View open-tracking activity for your sent emails.
      </p>

      {/* Empty state */}
      <div className="mt-12 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16">
        <svg
          className="h-12 w-12 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          No tracked emails yet
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Emails you track with the PostMail extension will appear here.
        </p>
      </div>
    </div>
  );
}
