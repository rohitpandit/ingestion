import { useCallback, useState } from 'react';

interface Props {
  /** Resolved lazily so large payloads are only built when copied. */
  getText: () => string;
  label?: string;
}

/** Falls back to a textarea when the clipboard API is unavailable. */
async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ getText, label = 'Copy' }: Props): JSX.Element {
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle');

  const onClick = useCallback(() => {
    void copy(getText()).then((ok) => {
      setState(ok ? 'done' : 'error');
      window.setTimeout(() => setState('idle'), 1800);
    });
  }, [getText]);

  return (
    <button type="button" className="btn-secondary text-xs" onClick={onClick}>
      {state === 'done' ? 'Copied' : state === 'error' ? 'Copy failed' : label}
    </button>
  );
}
