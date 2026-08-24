import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';

// Placeholder pages — will be implemented in later tasks
function LoginPlaceholder() {
  return <div className="p-8 text-center text-gray-600">Login page (coming next)</div>;
}

function DashboardPlaceholder() {
  return <div className="p-8 text-center text-gray-600">Dashboard (coming next)</div>;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPlaceholder />} />
        <Route
          path="/dashboard/*"
          element={
            <AuthGuard>
              <DashboardPlaceholder />
            </AuthGuard>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
