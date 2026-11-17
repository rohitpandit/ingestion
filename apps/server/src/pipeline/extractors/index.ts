import { PipelineError } from '../pipeline-error.js';
import type { ExtractInput, Extractor } from '../types.js';
import { CsvExtractor } from './csv.js';
import { PdfExtractor } from './pdf.js';

/** Adding a format means adding an Extractor and registering it here. */
export const extractorRegistry: Extractor[] = [new PdfExtractor(), new CsvExtractor()];

export function resolveExtractor(input: ExtractInput): Extractor {
  const extractor = extractorRegistry.find((candidate) => candidate.supports(input));
  if (!extractor) {
    throw new PipelineError('UNSUPPORTED_TYPE');
  }
  return extractor;
}

export { CsvExtractor, PdfExtractor };
