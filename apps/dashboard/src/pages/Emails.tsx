export default function Emails() {
  return (
    <div>
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
