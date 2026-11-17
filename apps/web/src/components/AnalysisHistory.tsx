import type { AnalysisSummary } from '@mdiw/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { StatusBadge } from './StatusBadge.js';

interface Props {
  workspaceId: string;
  analyses: AnalysisSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function AnalysisHistory({ workspaceId, analyses, activeId, onSelect }: Props): JSX.Element {
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAnalysis(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['analyses', workspaceId] }),
  });

  return (
    <div className="panel p-3">
      <h2 className="text-sm font-semibold text-white">History</h2>
      <p className="mt-0.5 text-xs text-slate-400">Every analysis run in this workspace.</p>

      {analyses.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">Nothing yet.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {analyses.map((analysis) => (
            <li key={analysis.id}>
              <div
                className={`rounded-md border p-2 ${
                  activeId === analysis.id ? 'border-sky-500/60 bg-sky-500/5' : 'border-edge'
                }`}
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => onSelect(analysis.id)}
                >
                  <span className="line-clamp-2 text-xs text-slate-200">{analysis.prompt}</span>
                  <span className="mt-1 flex items-center gap-2">
                    <StatusBadge status={analysis.status} />
                    <span className="text-[10px] text-slate-400">
                      {new Date(analysis.createdAt).toLocaleString()}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="mt-1 inline-flex min-h-[24px] items-center px-1 text-[10px] text-slate-400 hover:text-rose-300"
                  onClick={() => remove.mutate(analysis.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
