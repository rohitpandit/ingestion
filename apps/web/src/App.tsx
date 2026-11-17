import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { AppShell } from './components/AppShell.js';
import { Spinner } from './components/Spinner.js';
import { AuthPage } from './pages/AuthPage.js';
import { WorkspacePage } from './pages/WorkspacePage.js';
import { WorkspacesPage } from './pages/WorkspacesPage.js';

export function App(): JSX.Element {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<WorkspacesPage />} />
        <Route path="/workspaces/:workspaceId" element={<WorkspacePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
