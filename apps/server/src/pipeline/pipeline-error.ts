import { INGESTION_ERROR_COPY, type ErrorCode } from '@mdiw/shared';

/**
 * A failure that belongs to one document. It never aborts the batch: the
 * document is marked `failed` with this code and the rest keep processing.
 */
export class PipelineError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? INGESTION_ERROR_COPY[code] ?? 'The document could not be processed.');
    this.name = 'PipelineError';
    this.code = code;
  }
}

export function toPipelineError(error: unknown): PipelineError {
  if (error instanceof PipelineError) return error;
  const detail = error instanceof Error ? error.message : String(error);
  return new PipelineError('EXTRACTION_FAILED', `The document could not be processed (${detail}).`);
}
