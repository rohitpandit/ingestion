export const LIMITS = {
  /** Per-file upload ceiling. */
  maxFileBytes: 10 * 1024 * 1024,
  /** Files accepted in a single multipart request. */
  maxFilesPerRequest: 10,
  /** Documents a single workspace may hold. */
  maxDocumentsPerWorkspace: 50,
  /** Pages read from a PDF before the rest is skipped. */
  maxPdfPages: 300,
  /** Rows read from a CSV before the rest is skipped. */
  maxCsvRows: 50_000,
  /** Target size of a text chunk, in characters. */
  chunkChars: 2_000,
  /** Rows grouped into a single CSV chunk. */
  csvRowsPerChunk: 200,
  /** Characters of document text handed to the provider per document. */
  providerCharBudget: 12_000,
  /** Documents selectable for one analysis run. */
  maxDocumentsPerAnalysis: 20,
  promptMinChars: 3,
  promptMaxChars: 2_000,
} as const;

export const ALLOWED_EXTENSIONS = ['.pdf', '.csv'] as const;
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
] as const;
