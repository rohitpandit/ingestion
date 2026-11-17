import { DETECTED_TYPE_LABELS, formatLocation } from '@mdiw/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client.js';
import { Spinner } from './Spinner.js';

interface Props {
  documentId: string;
  onClose: () => void;
}

/**
 * Shows exactly what the pipeline pulled out of one document, before any
 * interpretation. This is the ground truth behind every cited finding.
 */
export function DocumentDrawer({ documentId, onClose }: Props): JSX.Element {
  const [tab, setTab] = useState<'facts' | 'text'>('facts');
  const { data, isLoading } = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => api.getDocument(documentId),
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-edge bg-panel p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">{data?.originalName ?? 'Document'}</h2>
            {data ? (
              <p className="mt-0.5 text-xs text-slate-400">
                {DETECTED_TYPE_LABELS[data.detectedType]} · {data.facts.length} extracted value
                {data.facts.length === 1 ? '' : 's'}
                {data.primaryEntity ? ` · attributed to ${data.primaryEntity}` : ''}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 flex gap-1 border-b border-edge">
          {(['facts', 'text'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`px-3 py-2 text-xs font-medium ${
                tab === value ? 'border-b-2 border-sky-500 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => setTab(value)}
            >
              {value === 'facts' ? 'Extracted values' : 'Extracted text'}
            </button>
          ))}
        </div>

        {isLoading ? <div className="mt-4"><Spinner label="Loading document" /></div> : null}

        {data && tab === 'facts' ? (
          data.facts.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No structured values were extracted from this document.</p>
          ) : (
            <table className="mt-4 w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Field</th>
                  <th className="py-1.5 pr-3 font-medium">Value</th>
                  <th className="py-1.5 pr-3 font-medium">Where</th>
                  <th className="py-1.5 font-medium">How</th>
                </tr>
              </thead>
              <tbody>
                {data.facts.map((fact) => (
                  <tr key={fact.id} className="border-t border-edge/60 align-top">
                    <td className="py-1.5 pr-3 text-slate-300">
                      {fact.fieldLabel ?? fact.fieldKey}
                      <span className="block text-[10px] text-slate-400">{fact.fieldKey}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-slate-100">{fact.rawValue}</td>
                    <td className="py-1.5 pr-3 text-slate-400">{formatLocation(fact.location)}</td>
                    <td className="py-1.5 text-slate-400">{fact.method.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : null}

        {data && tab === 'text' ? (
          <pre className="mt-4 whitespace-pre-wrap break-words rounded-md border border-edge bg-surface p-3 text-xs text-slate-300">
            {data.preview || 'No text was extracted.'}
          </pre>
        ) : null}
      </aside>
    </div>
  );
}
