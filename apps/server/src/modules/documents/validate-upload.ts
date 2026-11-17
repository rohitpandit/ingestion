import path from 'node:path';
import {
  ALLOWED_EXTENSIONS,
  INGESTION_ERROR_COPY,
  LIMITS,
  type DocumentKind,
  type ErrorCode,
} from '@mdiw/shared';

export interface UploadCandidate {
  originalName: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export type ValidationOutcome =
  | { ok: true; kind: DocumentKind; mime: string }
  | { ok: false; code: ErrorCode; message: string };

const PDF_MAGIC = Buffer.from('%PDF-');

function reject(code: ErrorCode, message?: string): ValidationOutcome {
  return { ok: false, code, message: message ?? INGESTION_ERROR_COPY[code] ?? 'Invalid file.' };
}

function looksLikeText(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  const sample = buffer.subarray(0, 4_096);
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(sample);
  // A high replacement-character ratio means this was not UTF-8 text.
  const replacements = (decoded.match(/\uFFFD/g) ?? []).length;
  return replacements / Math.max(decoded.length, 1) < 0.02;
}

/**
 * Extension allowlist plus a magic-byte check, so a renamed binary cannot
 * reach the pipeline by claiming to be a PDF.
 */
export function validateUpload(file: UploadCandidate): ValidationOutcome {
  if (file.size === 0) return reject('EMPTY_CONTENT', 'The file is empty.');
  if (file.size > LIMITS.maxFileBytes) return reject('TOO_LARGE');

  const extension = path.extname(file.originalName).toLowerCase();
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
    return reject('UNSUPPORTED_TYPE');
  }

  if (extension === '.pdf') {
    if (!file.buffer.subarray(0, 1_024).includes(PDF_MAGIC)) {
      return reject('EXTENSION_MISMATCH', 'This file is named .pdf but is not a PDF.');
    }
    return { ok: true, kind: 'pdf', mime: 'application/pdf' };
  }

  if (file.buffer.subarray(0, 1_024).includes(PDF_MAGIC)) {
    return reject('EXTENSION_MISMATCH', 'This file is named .csv but contains PDF data.');
  }
  if (!looksLikeText(file.buffer)) {
    return reject('EXTENSION_MISMATCH', 'This file is named .csv but is not UTF-8 text.');
  }

  return { ok: true, kind: 'csv', mime: 'text/csv' };
}
