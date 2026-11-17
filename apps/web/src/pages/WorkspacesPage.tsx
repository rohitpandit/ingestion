import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiRequestError } from '../api/client.js';
import { Spinner } from '../components/Spinner.js';

export function WorkspacesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: api.listWorkspaces });

  const create = useMutation({
    mutationFn: (value: string) => api.createWorkspace(value),
    onSuccess: () => {
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not create the workspace.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteWorkspace(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
  });

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    setError(null);
    if (name.trim().length === 0) return;
    create.mutate(name.trim());
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-base font-semibold text-white">Workspaces</h1>
      <p className="mt-1 text-sm text-slate-400">
        A workspace holds a set of documents and every analysis you have run against them.
      </p>

      <form className="panel mt-5 flex gap-2 p-3" onSubmit={onSubmit}>
        <input
          className="input"
          placeholder="New workspace name, for example 'Northwind credit file'"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
        <button className="btn-primary shrink-0" type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating...' : 'Create'}
        </button>
      </form>

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      <div className="mt-5 space-y-2">
        {workspaces.isLoading ? <Spinner label="Loading workspaces" /> : null}

        {workspaces.data?.length === 0 ? (
          <p className="panel p-6 text-center text-sm text-slate-400">
            No workspaces yet. Create one above to upload documents.
          </p>
        ) : null}

        {workspaces.data?.map((workspace) => (
          <div key={workspace.id} className="panel flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <Link
                to={`/workspaces/${workspace.id}`}
                className="block truncate text-sm font-medium text-sky-300 hover:underline"
              >
                {workspace.name}
              </Link>
              <p className="mt-0.5 text-xs text-slate-400">
                {workspace.documentCount} document{workspace.documentCount === 1 ? '' : 's'} ·{' '}
                {workspace.analysisCount} analysis run{workspace.analysisCount === 1 ? '' : 's'} · updated{' '}
                {new Date(workspace.updatedAt).toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              className="btn-danger shrink-0"
              onClick={() => {
                if (window.confirm(`Delete "${workspace.name}" and all of its documents?`)) {
                  remove.mutate(workspace.id);
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
