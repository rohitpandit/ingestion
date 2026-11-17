import { credentialsSchema } from '@mdiw/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiRequestError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';

interface Props {
  mode: 'login' | 'register';
}

export function AuthPage({ mode }: Props): JSX.Element {
  const { login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the details you entered.');
      return;
    }

    setBusy(true);
    try {
      if (isRegister) await register(parsed.data.email, parsed.data.password);
      else await login(parsed.data.email, parsed.data.password);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-white">Multi-Document Intelligence Workbench</h1>
        <p className="mt-1 text-sm text-slate-400">
          {isRegister ? 'Create an account to start a workspace.' : 'Sign in to your workspaces.'}
        </p>

        <form className="panel mt-6 space-y-4 p-5" onSubmit={(event) => void onSubmit(event)}>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {isRegister ? (
              <p className="mt-1 text-xs text-slate-400">At least 10 characters.</p>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          ) : null}

          <button className="btn-primary w-full" type="submit" disabled={busy}>
            {busy ? 'Working...' : isRegister ? 'Create account' : 'Sign in'}
          </button>

          <p className="text-center text-xs text-slate-400">
            {isRegister ? 'Already have an account? ' : 'No account yet? '}
            <Link className="text-sky-400 hover:underline" to={isRegister ? '/login' : '/register'}>
              {isRegister ? 'Sign in' : 'Create one'}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
