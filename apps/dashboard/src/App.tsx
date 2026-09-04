import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';
import DashboardLayout from './components/DashboardLayout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Emails from './pages/Emails';
import Settings from './pages/Settings';
import OAuthCallback from './pages/OAuthCallback';
import MicrosoftAuthCallback from './pages/MicrosoftAuthCallback';
import Home from './pages/Home';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import GmailCallback from './pages/GmailCallback';
import OutlookCallback from './pages/OutlookCallback';
import EmailDetail from './pages/EmailDetail';
import AttachmentPreview from './pages/AttachmentPreview';
import Setup from './pages/Setup';
function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/microsoft/callback" element={<MicrosoftAuthCallback />} />
        <Route path="/gmail/callback" element={<AuthGuard><GmailCallback /></AuthGuard>} />
        <Route path="/outlook/callback" element={<AuthGuard><OutlookCallback /></AuthGuard>} />
        <Route path="/preview" element={<AuthGuard><AttachmentPreview /></AuthGuard>} />
        <Route
          path="/dashboard"
          element={
            <AuthGuard>
              <DashboardLayout />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="emails" replace />} />
          <Route path="emails" element={<Emails />} />
          <Route path="emails/:id" element={<EmailDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="setup" element={<Setup />} />
        </Route>
        <Route path="/" element={<Home />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
