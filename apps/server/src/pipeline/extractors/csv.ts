import { readFile } from 'node:fs/promises';
import { LIMITS, type DocumentWarning } from '@mdiw/shared';
import { parse } from 'csv-parse/sync';
import { normalizeLine } from '../normalize.js';
import { PipelineError } from '../pipeline-error.js';
import type { CsvTable, ExtractInput, Extractor, RawDocument, RawSegment, TextLine } from '../types.js';

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'] as const;

/** Picks the delimiter that yields the most consistent column count. */
function detectDelimiter(sample: string): string {
  let best = ',';
  let bestScore = -1;

  for (const delimiter of CANDIDATE_DELIMITERS) {
    const lines = sample.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 10);
    if (lines.length === 0) continue;
    const counts = lines.map((line) => line.split(delimiter).length);
    const columns = counts[0] ?? 1;
    if (columns < 2) continue;
    const consistent = counts.filter((count) => count === columns).length;
    const score = columns * consistent;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

function looksLikeHeader(row: string[]): boolean {
  const nonEmpty = row.filter((cell) => cell.trim().length > 0);
  if (nonEmpty.length === 0) return false;
  const numeric = nonEmpty.filter((cell) => /^[-+]?[\d.,%\s$£€₹]+$/.test(cell.trim()));
  return numeric.length / nonEmpty.length < 0.5;
}

export class CsvExtractor implements Extractor {
  readonly name = 'csv';

  supports(input: ExtractInput): boolean {
    return input.kind === 'csv';
  }

  async extract(input: ExtractInput): Promise<RawDocument> {
    const buffer = await readFile(input.filePath);
    if (buffer.includes(0)) {
      throw new PipelineError('CSV_MALFORMED', 'The file contains binary data and is not a CSV.');
    }

    const content = buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (content.trim().length === 0) {
      throw new PipelineError('EMPTY_CONTENT');
    }

    const delimiter = detectDelimiter(content.slice(0, 8_000));

    let records: string[][];
    try {
      records = parse(content, {
        delimiter,
        bom: true,
        relax_column_count: true,
        relax_quotes: true,
        skip_empty_lines: true,
        trim: true,
      }) as string[][];
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new PipelineError('CSV_MALFORMED', `The CSV could not be parsed (${detail}).`);
    }

    if (records.length === 0) {
      throw new PipelineError('EMPTY_CONTENT');
    }

    const warnings: DocumentWarning[] = [];
    const firstRow = records[0] ?? [];
    const hasHeader = looksLikeHeader(firstRow);

    if (!hasHeader) {
      warnings.push({
        code: 'NO_HEADER_ROW',
        message: 'No header row was detected, so columns are referenced by position.',
      });
    }

    const headers = hasHeader
      ? firstRow.map((cell, index) => normalizeLine(cell) || `column_${index + 1}`)
      : firstRow.map((_, index) => `column_${index + 1}`);

    const dataRows = hasHeader ? records.slice(1) : records;
    const totalRows = dataRows.length;
    const rowLimit = Math.min(totalRows, LIMITS.maxCsvRows);
    const truncated = rowLimit < totalRows;

    if (truncated) {
      warnings.push({
        code: 'ROWS_TRUNCATED',
        message: `Only the first ${rowLimit} of ${totalRows} rows were read.`,
      });
    }

    const rows = dataRows.slice(0, rowLimit).map((row) => row.map((cell) => normalizeLine(cell)));
    if (rows.length === 0) {
      throw new PipelineError('EMPTY_CONTENT', 'The CSV has a header but no data rows.');
    }

    const table: CsvTable = { headers, rows, delimiter };
    const headerLine = headers.join(' | ');
    const segments: RawSegment[] = [];

    for (let start = 0; start < rows.length; start += LIMITS.csvRowsPerChunk) {
      const slice = rows.slice(start, start + LIMITS.csvRowsPerChunk);
      const lines: TextLine[] = slice.map((row, offset) => ({
        text: headers
          .map((header, column) => `${header}: ${row[column] ?? ''}`)
          .filter((pair) => !pair.endsWith(': '))
          .join('; '),
        location: { kind: 'csv', row: start + offset + 1 },
      }));

      segments.push({
        text: [headerLine, ...lines.map((line) => line.text)].join('\n'),
        location: { kind: 'csv', row: start + 1, rowEnd: start + slice.length },
        lines,
      });
    }

    return {
      kind: 'csv',
      segments,
      pageCount: null,
      rowCount: totalRows,
      truncated,
      warnings,
      table,
    };
  }
}
