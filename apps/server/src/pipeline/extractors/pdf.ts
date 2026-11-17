import { readFile } from 'node:fs/promises';
import { LIMITS, type DocumentWarning, type SourceLocation } from '@mdiw/shared';
import { normalizeLine } from '../normalize.js';
import { PipelineError } from '../pipeline-error.js';
import type { ExtractInput, Extractor, RawDocument, RawSegment, TextLine } from '../types.js';

/** Vertical tolerance, in PDF units, for treating glyphs as the same line. */
const LINE_TOLERANCE = 2.5;

interface PositionedItem {
  str: string;
  x: number;
  y: number;
}

/** pdfjs is heavy and ESM-only; load it on first use rather than at boot. */
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

function groupIntoLines(items: PositionedItem[], page: number): TextLine[] {
  const buckets: Array<{ y: number; items: PositionedItem[] }> = [];

  for (const item of items) {
    const bucket = buckets.find((candidate) => Math.abs(candidate.y - item.y) <= LINE_TOLERANCE);
    if (bucket) {
      bucket.items.push(item);
    } else {
      buckets.push({ y: item.y, items: [item] });
    }
  }

  // PDF origin is bottom-left, so descending y is top-to-bottom reading order.
  buckets.sort((a, b) => b.y - a.y);

  const lines: TextLine[] = [];
  buckets.forEach((bucket) => {
    const text = normalizeLine(
      bucket.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.str)
        .join(' '),
    );
    if (text.length === 0) return;
    const location: SourceLocation = { kind: 'pdf', page, line: lines.length + 1 };
    lines.push({ text, location });
  });

  return lines;
}

export class PdfExtractor implements Extractor {
  readonly name = 'pdf';

  supports(input: ExtractInput): boolean {
    return input.kind === 'pdf';
  }

  async extract(input: ExtractInput): Promise<RawDocument> {
    const pdfjs = await loadPdfjs();
    const bytes = new Uint8Array(await readFile(input.filePath));

    let doc;
    try {
      doc = await pdfjs.getDocument({
        data: bytes,
        isEvalSupported: false,
        useSystemFonts: false,
        disableFontFace: true,
        verbosity: 0,
      }).promise;
    } catch (error) {
      throw translatePdfError(error);
    }

    const warnings: DocumentWarning[] = [];
    const totalPages = doc.numPages;
    const pageLimit = Math.min(totalPages, LIMITS.maxPdfPages);
    const truncated = pageLimit < totalPages;

    if (truncated) {
      warnings.push({
        code: 'PAGES_TRUNCATED',
        message: `Only the first ${pageLimit} of ${totalPages} pages were read.`,
      });
    }

    const segments: RawSegment[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        const items: PositionedItem[] = [];

        for (const item of content.items) {
          if (!('str' in item) || typeof item.str !== 'string') continue;
          if (item.str.trim().length === 0) continue;
          items.push({
            str: item.str,
            x: item.transform[4] as number,
            y: item.transform[5] as number,
          });
        }

        page.cleanup();

        const lines = groupIntoLines(items, pageNumber);
        if (lines.length === 0) continue;

        segments.push({
          text: lines.map((line) => line.text).join('\n'),
          location: { kind: 'pdf', page: pageNumber },
          lines,
        });
      }
    } finally {
      await doc.destroy();
    }

    if (segments.length === 0) {
      throw new PipelineError('NO_TEXT_LAYER');
    }

    return {
      kind: 'pdf',
      segments,
      pageCount: totalPages,
      rowCount: null,
      truncated,
      warnings,
    };
  }
}

function translatePdfError(error: unknown): PipelineError {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') return new PipelineError('ENCRYPTED_PDF');
  if (name === 'InvalidPDFException') return new PipelineError('CORRUPT_FILE');
  const detail = error instanceof Error ? error.message : String(error);
  return new PipelineError('CORRUPT_FILE', `The PDF could not be opened (${detail}).`);
}
