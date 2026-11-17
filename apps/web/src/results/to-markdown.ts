import {
  ANALYSIS_SECTION_LABELS,
  formatLocation,
  type AnalysisResult,
  type AnalysisSection,
  type SourceRef,
} from '@mdiw/shared';

function citations(sources: SourceRef[]): string {
  if (sources.length === 0) return '';
  const unique = new Map<string, string>();
  for (const source of sources) {
    unique.set(`${source.documentName}|${formatLocation(source.location)}`,
      `${source.documentName} (${formatLocation(source.location)})`);
  }
  return ` [source: ${Array.from(unique.values()).join('; ')}]`;
}

function escapeCell(value: string | null): string {
  return (value ?? '-').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Human-readable export that keeps every citation and basis label intact. */
export function resultToMarkdown(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push('# Multi-document analysis');
  lines.push('');
  lines.push(`**Instruction:** ${result.prompt}`);
  lines.push(`**Generated:** ${new Date(result.generatedAt).toLocaleString()} (provider: ${result.providerName})`);
  lines.push(`**Documents:** ${result.documents.map((document) => document.documentName).join(', ')}`);
  lines.push('');

  const include = (section: AnalysisSection): boolean => result.sections.includes(section);

  if (include('summary')) {
    lines.push(`## ${ANALYSIS_SECTION_LABELS.summary}`);
    lines.push('');
    lines.push(result.summary.headline);
    lines.push('');
    for (const statement of result.summary.statements) {
      const tag = statement.basis === 'extracted' ? 'Extracted' : 'Interpretation';
      lines.push(`- (${tag}) ${statement.text}${citations(statement.sources)}`);
      if (statement.rationale) lines.push(`  - Why: ${statement.rationale}`);
    }
    lines.push('');
  }

  if (include('comparisonTable') && result.comparisonTable.rows.length > 0) {
    lines.push(`## ${ANALYSIS_SECTION_LABELS.comparisonTable}`);
    lines.push('');
    const header = ['Field', 'Agreement', ...result.comparisonTable.columns.map((column) => column.documentName)];
    lines.push(`| ${header.join(' | ')} |`);
    lines.push(`| ${header.map(() => '---').join(' | ')} |`);
    for (const row of result.comparisonTable.rows) {
      lines.push(
        `| ${[row.label, row.agreement, ...row.cells.map((cell) => escapeCell(cell.value))]
          .map(escapeCell)
          .join(' | ')} |`,
      );
    }
    lines.push('');
  }

  if (include('discrepancies')) {
    lines.push(`## ${ANALYSIS_SECTION_LABELS.discrepancies}`);
    lines.push('');
    if (result.discrepancies.length === 0) {
      lines.push('No conflicting values were found.');
    }
    for (const discrepancy of result.discrepancies) {
      lines.push(`### ${discrepancy.label} (${discrepancy.severity})`);
      lines.push('');
      lines.push(`${discrepancy.description} _(AI interpretation)_`);
      if (discrepancy.rationale) lines.push(`Why: ${discrepancy.rationale}`);
      lines.push('');
      for (const value of discrepancy.values) {
        lines.push(`- **${value.documentName}:** ${value.value}${citations(value.sources)}`);
      }
      lines.push('');
    }
  }

  if (include('missingInformation')) {
    lines.push(`## ${ANALYSIS_SECTION_LABELS.missingInformation}`);
    lines.push('');
    if (result.missingInformation.length === 0) {
      lines.push('Every expected field was present.');
      lines.push('');
    }
    for (const report of result.missingInformation) {
      lines.push(`### ${report.documentName}`);
      lines.push('');
      for (const field of report.missing) {
        lines.push(`- ${field.label} (${field.importance}): ${field.reason}`);
      }
      lines.push('');
    }
  }

  if (include('keyValues')) {
    lines.push(`## ${ANALYSIS_SECTION_LABELS.keyValues}`);
    lines.push('');
    for (const document of result.keyValues) {
      lines.push(`### ${document.documentName}`);
      lines.push('');
      for (const entry of document.entries) {
        lines.push(`- **${entry.label}:** ${entry.value}${citations(entry.sources)}`);
      }
      lines.push('');
    }
  }

  if (include('perDocument')) {
    lines.push(`## ${ANALYSIS_SECTION_LABELS.perDocument}`);
    lines.push('');
    for (const document of result.perDocument) {
      lines.push(`### ${document.documentName}`);
      lines.push('');
      for (const statement of document.statements) {
        const tag = statement.basis === 'extracted' ? 'Extracted' : 'Interpretation';
        lines.push(`- (${tag}) ${statement.text}${citations(statement.sources)}`);
      }
      lines.push('');
    }
  }

  if (result.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const warning of result.warnings) lines.push(`- ${warning.message}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function resultToJson(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}
