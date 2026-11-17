import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-edge bg-panel">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-3">
          <Link to="/" className="flex items-baseline gap-3">
            <span className="text-sm font-semibold text-white">Multi-Document Intelligence Workbench</span>
            <span className="text-xs text-slate-400">PDF and CSV analysis with traceable findings</span>
          </Link>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>{user?.email}</span>
            <button type="button" className="btn-secondary" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
