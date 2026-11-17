import type { FindingBasis } from '@mdiw/shared';

interface Props {
  basis: FindingBasis;
  rationale?: string | null;
  confidence?: number | null;
}

/**
 * Keeps the two kinds of content visibly apart: values lifted from a document
 * versus conclusions the engine drew from them.
 */
export function BasisTag({ basis, rationale, confidence }: Props): JSX.Element {
  if (basis === 'extracted') {
    return (
      <span className="chip border-emerald-500/40 bg-emerald-500/5 text-emerald-300" title="Taken verbatim from the document">
        Extracted fact
      </span>
    );
  }

  const percent = typeof confidence === 'number' ? ` · ${Math.round(confidence * 100)}% confidence` : '';
  return (
    <span
      className="chip border-violet-500/40 bg-violet-500/5 text-violet-300"
      title={rationale ?? 'Derived by the analysis engine'}
    >
      AI interpretation{percent}
    </span>
  );
}

export function Rationale({ text }: { text: string | null }): JSX.Element | null {
  if (!text) return null;
  return <p className="mt-1 text-xs italic text-slate-400">Why: {text}</p>;
}
