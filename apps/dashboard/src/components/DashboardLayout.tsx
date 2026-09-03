import { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { auth } from '../services/auth';

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const [setupIncomplete, setSetupIncomplete] = useState(false);

  const setupChecked = useRef(false);
  useEffect(() => {
    if (setupChecked.current) return;
    setupChecked.current = true;

    const account = !!user;
    const extension = document.documentElement.hasAttribute('data-postmail-extension');
    const token = !!auth.getToken();

    api.getSettings()
      .then((settings) => {
        const mailbox = settings.mailboxConnected ?? false;
        setSetupIncomplete(!account || !extension || !token || !mailbox);
      })
      .catch(() => setSetupIncomplete(true));
  }, [user]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} setupIncomplete={setupIncomplete} />

      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="relative rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            {setupIncomplete && (
              <span className="absolute right-0 top-0 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
            )}
          </button>
          <h1 className="text-lg font-bold text-gray-900">Post<span className="text-primary-500">Mail</span></h1>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
