export function Spinner({ label }: { label?: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-400">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
      {label}
    </span>
  );
}
