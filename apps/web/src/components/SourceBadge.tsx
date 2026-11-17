import { formatLocation, type SourceRef } from '@mdiw/shared';

/** The clickable provenance marker: which document, and where inside it. */
export function SourceBadge({ source }: { source: SourceRef }): JSX.Element {
  return (
    <span
      className="chip border-edge bg-surface text-slate-400 hover:border-slate-500 hover:text-slate-200"
      title={source.snippet}
    >
      <span className="max-w-[14rem] truncate">{source.documentName}</span>
      <span className="text-slate-400">· {formatLocation(source.location)}</span>
    </span>
  );
}

export function SourceList({ sources, limit = 6 }: { sources: SourceRef[]; limit?: number }): JSX.Element | null {
  if (sources.length === 0) return null;
  const shown = sources.slice(0, limit);
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {shown.map((source, index) => (
        <SourceBadge key={`${source.documentId}-${source.factId ?? index}`} source={source} />
      ))}
      {sources.length > shown.length ? (
        <span className="chip border-edge text-slate-400">+{sources.length - shown.length} more</span>
      ) : null}
    </div>
  );
}
