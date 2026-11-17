import type {
  AnalysisWarning,
  ComparisonTable,
  DetectedType,
  Discrepancy,
  DocumentKeyValues,
  ExtractedFact,
  MissingInformationReport,
  PerDocumentAnalysis,
  Statement,
} from '@mdiw/shared';
import type { ParsedInstruction } from './instruction.js';

/** One document's own evidence, assembled before any cross-document work. */
export interface DocumentContext {
  documentId: string;
  documentName: string;
  detectedType: DetectedType;
  primaryEntity: string | null;
  pageCount: number | null;
  rowCount: number | null;
  chunkCount: number;
  truncated: boolean;
  facts: ExtractedFact[];
  /** Instruction-relevant excerpts, already trimmed to the char budget. */
  excerpts: Array<{ text: string; location: ExtractedFact['location'] }>;
}

/** What the provider returns for a single document. */
export interface DocumentAnalysis {
  context: DocumentContext;
  perDocument: PerDocumentAnalysis;
  keyValues: DocumentKeyValues;
  missing: MissingInformationReport;
}

/** What the provider returns once it has seen every document analysis. */
export interface CrossDocumentAnalysis {
  headline: string;
  statements: Statement[];
  comparisonTable: ComparisonTable;
  discrepancies: Discrepancy[];
  warnings: AnalysisWarning[];
}

/**
 * The seam a real model would sit behind. Documents are analysed one at a
 * time and only then synthesised, so document boundaries survive the run.
 */
export interface LlmProvider {
  readonly name: string;
  analyzeDocument(context: DocumentContext, instruction: ParsedInstruction): Promise<DocumentAnalysis>;
  synthesize(
    analyses: DocumentAnalysis[],
    instruction: ParsedInstruction,
  ): Promise<CrossDocumentAnalysis>;
}
