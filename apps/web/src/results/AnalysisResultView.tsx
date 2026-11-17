import {
  ANALYSIS_SECTION_LABELS,
  DETECTED_TYPE_LABELS,
  describeDetectedType,
  type AnalysisResult,
  type AnalysisSection,
} from '@mdiw/shared';
import { useMemo, useState } from 'react';
import { BasisTag, Rationale } from '../components/BasisTag.js';
import { CopyButton } from '../components/CopyButton.js';
import { SourceList } from '../components/SourceBadge.js';
import { resultToJson, resultToMarkdown } from './to-markdown.js';

const SEVERITY_STYLES: Record<string, string> = {
  high: 'border-rose-500/50 text-rose-300',
  medium: 'border-amber-500/50 text-amber-300',
  low: 'border-slate-600 text-slate-400',
};

const AGREEMENT_STYLES: Record<string, string> = {
  agree: 'border-emerald-500/40 text-emerald-300',
  partial: 'border-sky-500/40 text-sky-300',
  differs: 'border-rose-500/50 text-rose-300',
  single: 'border-slate-600 text-slate-400',
};

export function AnalysisResultView({ result }: { result: AnalysisResult }): JSX.Element {
  const sections = result.sections;
  const [active, setActive] = useState<AnalysisSection>(sections[0] ?? 'summary');
  const markdown = useMemo(() => () => resultToMarkdown(result), [result]);
  const json = useMemo(() => () => resultToJson(result), [result]);

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">Results</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {new Date(result.generatedAt).toLocaleString()} · provider {result.providerName} · intents{' '}
            {result.intents.join(', ')}
          </p>
        </div>
        <div className="flex gap-1">
          <CopyButton getText={markdown} label="Copy all (Markdown)" />
          <CopyButton getText={json} label="Copy all (JSON)" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1 border-b border-edge">
        {sections.map((section) => (
          <button
            key={section}
            type="button"
            className={`px-3 py-2 text-xs font-medium ${
              active === section ? 'border-b-2 border-sky-500 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setActive(section)}
          >
            {ANALYSIS_SECTION_LABELS[section]}
            {section === 'discrepancies' && result.discrepancies.length > 0
              ? ` (${result.discrepancies.length})`
              : ''}
          </button>
        ))}
      </div>

      {result.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {result.warnings.map((warning, index) => (
            <li
              key={`${warning.code}-${index}`}
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200"
            >
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4">
        {active === 'summary' ? <SummarySection result={result} /> : null}
        {active === 'comparisonTable' ? <ComparisonSection result={result} /> : null}
        {active === 'discrepancies' ? <DiscrepanciesSection result={result} /> : null}
        {active === 'missingInformation' ? <MissingSection result={result} /> : null}
        {active === 'keyValues' ? <KeyValuesSection result={result} /> : null}
        {active === 'perDocument' ? <PerDocumentSection result={result} /> : null}
      </div>
    </div>
  );
}

function SectionHeader({ title, getText }: { title: string; getText: () => string }): JSX.Element {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <CopyButton getText={getText} label="Copy section" />
    </div>
  );
}

function SummarySection({ result }: { result: AnalysisResult }): JSX.Element {
  return (
    <section>
      <SectionHeader
        title="Consolidated summary"
        getText={() =>
          [result.summary.headline, '', ...result.summary.statements.map((s) => `- ${s.text}`)].join('\n')
        }
      />
      <p className="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-slate-200">
        {result.summary.headline}
      </p>
      <ul className="mt-3 space-y-3">
        {result.summary.statements.map((statement) => (
          <li key={statement.id} className="rounded-md border border-edge bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <BasisTag basis={statement.basis} rationale={statement.rationale} confidence={statement.confidence} />
            </div>
            <p className="mt-1.5 text-sm text-slate-200">{statement.text}</p>
            <Rationale text={statement.rationale} />
            <SourceList sources={statement.sources} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ComparisonSection({ result }: { result: AnalysisResult }): JSX.Element {
  const { columns, rows } = result.comparisonTable;

  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No comparable fields were found across these documents.</p>;
  }

  return (
    <section>
      <SectionHeader
        title="Structured comparison"
        getText={() =>
          [
            ['Field', 'Agreement', ...columns.map((c) => c.documentName)].join('\t'),
            ...rows.map((row) =>
              [row.label, row.agreement, ...row.cells.map((cell) => cell.value ?? '')].join('\t'),
            ),
          ].join('\n')
        }
      />
      <div className="overflow-x-auto rounded-md border border-edge">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-surface text-slate-400">
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium">Field</th>
              {columns.map((column) => (
                <th key={column.documentId} className="min-w-[12rem] px-3 py-2 font-medium">
                  <span className="block truncate text-slate-200">{column.documentName}</span>
                  <span className="text-[10px] text-slate-400">{DETECTED_TYPE_LABELS[column.detectedType]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.fieldKey}-${row.label}`} className="border-t border-edge/60 align-top">
                <th className="sticky left-0 z-10 bg-panel px-3 py-2 text-left font-normal">
                  <span className="block text-slate-200">{row.label}</span>
                  <span className={`chip mt-1 ${AGREEMENT_STYLES[row.agreement]}`}>{row.agreement}</span>
                </th>
                {row.cells.map((cell) => (
                  <td
                    key={`${row.fieldKey}-${cell.documentId}`}
                    className={`px-3 py-2 ${cell.outlier ? 'bg-rose-500/10 text-rose-200' : 'text-slate-300'}`}
                  >
                    {cell.value ?? <span className="text-slate-400">not stated</span>}
                    <SourceList sources={cell.sources} limit={2} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DiscrepanciesSection({ result }: { result: AnalysisResult }): JSX.Element {
  if (result.discrepancies.length === 0) {
    return <p className="text-sm text-slate-400">No conflicting values were found across these documents.</p>;
  }

  return (
    <section>
      <SectionHeader
        title="Discrepancies"
        getText={() => result.discrepancies.map((d) => `[${d.severity}] ${d.description}`).join('\n')}
      />
      <ul className="space-y-3">
        {result.discrepancies.map((discrepancy) => (
          <li key={discrepancy.id} className="rounded-md border border-edge bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`chip ${SEVERITY_STYLES[discrepancy.severity]}`}>{discrepancy.severity}</span>
              <span className="text-sm font-medium text-slate-100">{discrepancy.label}</span>
              <BasisTag
                basis={discrepancy.basis}
                rationale={discrepancy.rationale}
                confidence={discrepancy.confidence}
              />
            </div>
            <p className="mt-1.5 text-sm text-slate-300">{discrepancy.description}</p>
            <Rationale text={discrepancy.rationale} />

            <ul className="mt-2 space-y-1.5">
              {discrepancy.values.map((value) => (
                <li key={`${discrepancy.id}-${value.documentId}`} className="rounded border border-edge/70 px-2 py-1.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs text-slate-400">{value.documentName}</span>
                    <span className="text-sm text-slate-100">{value.value}</span>
                  </div>
                  <SourceList sources={value.sources} limit={3} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MissingSection({ result }: { result: AnalysisResult }): JSX.Element {
  if (result.missingInformation.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Every field expected for these document types was present.
      </p>
    );
  }

  return (
    <section>
      <SectionHeader
        title="Missing information"
        getText={() =>
          result.missingInformation
            .flatMap((report) => [
              report.documentName,
              ...report.missing.map((field) => `  - ${field.label} (${field.importance})`),
            ])
            .join('\n')
        }
      />
      <div className="space-y-3">
        {result.missingInformation.map((report) => (
          <div key={report.documentId} className="rounded-md border border-edge bg-surface p-3">
            <p className="text-sm font-medium text-slate-100">{report.documentName}</p>
            <p className="text-xs text-slate-400">
              Expected for {describeDetectedType(report.detectedType)}
            </p>
            <ul className="mt-2 space-y-1">
              {report.missing.map((field) => (
                <li key={field.fieldKey} className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className={`chip ${SEVERITY_STYLES[field.importance]}`}>{field.importance}</span>
                  <span className="text-slate-200">{field.label}</span>
                  <span className="text-xs text-slate-400">{field.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function KeyValuesSection({ result }: { result: AnalysisResult }): JSX.Element {
  return (
    <section>
      <SectionHeader
        title="Key-value extraction"
        getText={() =>
          result.keyValues
            .flatMap((document) => [
              document.documentName,
              ...document.entries.map((entry) => `  ${entry.label}: ${entry.value}`),
            ])
            .join('\n')
        }
      />
      <div className="grid gap-3 md:grid-cols-2">
        {result.keyValues.map((document) => (
          <div key={document.documentId} className="rounded-md border border-edge bg-surface p-3">
            <p className="truncate text-sm font-medium text-slate-100">{document.documentName}</p>
            <dl className="mt-2 space-y-2">
              {document.entries.map((entry, index) => (
                <div key={`${entry.fieldKey}-${index}`}>
                  <dt className="text-xs text-slate-400">{entry.label}</dt>
                  <dd className="text-sm text-slate-200">{entry.value}</dd>
                  <SourceList sources={entry.sources} limit={2} />
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function PerDocumentSection({ result }: { result: AnalysisResult }): JSX.Element {
  return (
    <section>
      <SectionHeader
        title="Per document"
        getText={() =>
          result.perDocument
            .flatMap((document) => [
              document.documentName,
              ...document.statements.map((statement) => `  - ${statement.text}`),
            ])
            .join('\n')
        }
      />
      <div className="space-y-3">
        {result.perDocument.map((document) => (
          <div key={document.documentId} className="rounded-md border border-edge bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-100">{document.documentName}</span>
              <span className="chip border-edge text-slate-400">
                {DETECTED_TYPE_LABELS[document.detectedType]}
              </span>
              <span className="text-xs text-slate-400">
                {document.stats.factCount} values · {document.stats.chunkCount} chunks
                {document.stats.pageCount ? ` · ${document.stats.pageCount} pages` : ''}
                {document.stats.rowCount ? ` · ${document.stats.rowCount} rows` : ''}
              </span>
            </div>

            <ul className="mt-2 space-y-2">
              {document.statements.map((statement) => (
                <li key={statement.id} className="rounded border border-edge/70 p-2">
                  <BasisTag
                    basis={statement.basis}
                    rationale={statement.rationale}
                    confidence={statement.confidence}
                  />
                  <p className="mt-1 text-sm text-slate-200">{statement.text}</p>
                  <Rationale text={statement.rationale} />
                  <SourceList sources={statement.sources} limit={2} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
