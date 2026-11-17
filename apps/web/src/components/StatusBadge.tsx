import type { AnalysisStatus, DocumentStatus } from '@mdiw/shared';

const STYLES: Record<string, string> = {
  queued: 'border-slate-600 text-slate-400',
  processing: 'border-sky-500/50 text-sky-300',
  ready: 'border-emerald-500/50 text-emerald-300',
  completed: 'border-emerald-500/50 text-emerald-300',
  failed: 'border-rose-500/50 text-rose-300',
};

export function StatusBadge({ status }: { status: DocumentStatus | AnalysisStatus }): JSX.Element {
  return <span className={`chip ${STYLES[status] ?? STYLES.queued}`}>{status}</span>;
}
