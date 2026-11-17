import { DETECTED_TYPE_LABELS, type DocumentSummary } from '@mdiw/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { StatusBadge } from './StatusBadge.js';

interface Props {
  workspaceId: string;
  documents: DocumentSummary[];
  selected: Set<string>;
  onToggle: (documentId: string) => void;
  onInspect: (documentId: string) => void;
}

function describeSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function describeExtent(document: DocumentSummary): string {
  if (document.pageCount !== null) return `${document.pageCount} page${document.pageCount === 1 ? '' : 's'}`;
  if (document.rowCount !== null) return `${document.rowCount} row${document.rowCount === 1 ? '' : 's'}`;
  return '';
}

export function DocumentList({ workspaceId, documents, selected, onToggle, onInspect }: Props): JSX.Element {
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteDocument(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
  });

  if (documents.length === 0) {
    return (
      <p className="panel p-6 text-center text-sm text-slate-400">
        No documents yet. Upload PDFs or CSVs to get started.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {documents.map((document) => {
        const isReady = document.status === 'ready';
        return (
          <li key={document.id} className="panel p-3">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-sky-500 disabled:opacity-40"
                checked={selected.has(document.id)}
                disabled={!isReady}
                onChange={() => onToggle(document.id)}
                aria-label={`Include ${document.originalName} in the analysis`}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    title={document.originalName}
                    className="max-w-full truncate text-sm font-medium text-slate-100 hover:text-sky-300"
                    onClick={() => onInspect(document.id)}
                  >
                    {document.originalName}
                  </button>
                  <StatusBadge status={document.status} />
                  {isReady ? (
                    <span className="chip border-edge text-slate-400">
                      {DETECTED_TYPE_LABELS[document.detectedType]}
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 text-xs text-slate-400">
                  {document.kind.toUpperCase()} · {describeSize(document.sizeBytes)}
                  {describeExtent(document) ? ` · ${describeExtent(document)}` : ''}
                  {isReady ? ` · ${document.factCount} extracted value${document.factCount === 1 ? '' : 's'}` : ''}
                </p>

                {document.status === 'failed' && document.errorMessage ? (
                  <p className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300">
                    {document.errorMessage}
                  </p>
                ) : null}

                {document.truncated ? (
                  <p className="mt-2 text-xs text-amber-300">
                    Only part of this document was read because of its size.
                  </p>
                ) : null}

                {document.warnings.map((warning) => (
                  <p key={warning.code} className="mt-1 text-xs text-amber-300">
                    {warning.message}
                  </p>
                ))}
              </div>

              <div className="flex shrink-0 gap-1">
                <button type="button" className="btn-secondary text-xs" onClick={() => onInspect(document.id)}>
                  Inspect
                </button>
                <button
                  type="button"
                  className="btn-danger text-xs"
                  onClick={() => remove.mutate(document.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
