import { z } from 'zod';

/**
 * Error codes shared by the API envelope and the ingestion pipeline. The
 * frontend maps these onto human-readable copy, so values are stable.
 */
export const ERROR_CODES = [
  // transport / auth
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
  // upload / ingestion
  'UNSUPPORTED_TYPE',
  'EXTENSION_MISMATCH',
  'ENCRYPTED_PDF',
  'CORRUPT_FILE',
  'NO_TEXT_LAYER',
  'EMPTY_CONTENT',
  'CSV_MALFORMED',
  'TOO_LARGE',
  'TOO_MANY_FILES',
  'WORKSPACE_FULL',
  'EXTRACTION_FAILED',
  // analysis
  'NO_READY_DOCUMENTS',
  'ANALYSIS_FAILED',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Default user-facing copy for each ingestion failure. */
export const INGESTION_ERROR_COPY: Partial<Record<ErrorCode, string>> = {
  UNSUPPORTED_TYPE: 'This file type is not supported. Upload a PDF or CSV.',
  EXTENSION_MISMATCH: 'The file contents do not match its extension.',
  ENCRYPTED_PDF: 'This PDF is password protected and cannot be read.',
  CORRUPT_FILE: 'The file is damaged and could not be opened.',
  NO_TEXT_LAYER:
    'This PDF has no selectable text (it looks scanned), so no content could be extracted.',
  EMPTY_CONTENT: 'No readable content was found in this file.',
  CSV_MALFORMED: 'The CSV could not be parsed. Check the delimiters and quoting.',
  TOO_LARGE: 'The file exceeds the maximum upload size.',
  EXTRACTION_FAILED: 'The document could not be processed.',
};
