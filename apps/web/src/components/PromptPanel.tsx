import { EXAMPLE_INSTRUCTIONS, LIMITS } from '@mdiw/shared';
import { useState } from 'react';

interface Props {
  selectedCount: number;
  busy: boolean;
  error: string | null;
  onRun: (prompt: string) => void;
}

export function PromptPanel({ selectedCount, busy, error, onRun }: Props): JSX.Element {
  const [prompt, setPrompt] = useState('');
  const disabled = busy || selectedCount === 0 || prompt.trim().length < LIMITS.promptMinChars;

  return (
    <div className="panel p-4">
      <h2 className="text-sm font-semibold text-white">Analysis instruction</h2>
      <p className="mt-0.5 text-xs text-slate-400">
        Describe what you need. Each document is analysed on its own first, then compared.
      </p>

      <textarea
        className="input mt-3 h-24 resize-y"
        maxLength={LIMITS.promptMaxChars}
        placeholder="For example: Identify inconsistencies between the application form and supporting documents."
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />

      <div className="mt-2 flex flex-wrap gap-1">
        {EXAMPLE_INSTRUCTIONS.map((example) => (
          <button
            key={example}
            type="button"
            title={example}
            className="chip max-w-full truncate border-edge py-1 text-slate-400 hover:border-sky-500 hover:text-sky-300"
            onClick={() => setPrompt(example)}
          >
            {example}
          </button>
        ))}
      </div>

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400">
          {selectedCount === 0
            ? 'Select at least one processed document.'
            : `${selectedCount} document${selectedCount === 1 ? '' : 's'} selected`}
        </span>
        <button type="button" className="btn-primary" disabled={disabled} onClick={() => onRun(prompt.trim())}>
          {busy ? 'Running...' : 'Run analysis'}
        </button>
      </div>
    </div>
  );
}
