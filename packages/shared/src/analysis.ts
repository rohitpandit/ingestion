import { z } from 'zod';
import { detectedTypeSchema, sourceLocationSchema } from './documents.js';

export const analysisStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed']);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

/**
 * `extracted` means the value was lifted verbatim from a document and can be
 * pointed at. `interpreted` means the engine derived it, so it must carry a
 * rationale and a confidence. The UI never blends the two.
 */
export const findingBasisSchema = z.enum(['extracted', 'interpreted']);
export type FindingBasis = z.infer<typeof findingBasisSchema>;

export const sourceRefSchema = z.object({
  documentId: z.string().uuid(),
  documentName: z.string(),
  location: sourceLocationSchema,
  snippet: z.string(),
  factId: z.string().uuid().nullable().default(null),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

const basisFields = {
  basis: findingBasisSchema,
  rationale: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1).nullable().default(null),
};

/** Interpretations must explain themselves; extractions must cite a source. */
function requireProvenance<
  T extends { basis: FindingBasis; rationale: string | null; sources: unknown[] },
>(value: T, ctx: z.RefinementCtx): void {
  if (value.basis === 'interpreted' && !value.rationale) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rationale'],
      message: 'An interpreted finding must include a rationale.',
    });
  }
  if (value.basis === 'extracted' && value.sources.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sources'],
      message: 'An extracted finding must cite at least one source.',
    });
  }
}

export const statementSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    sources: z.array(sourceRefSchema).default([]),
    ...basisFields,
  })
  .superRefine(requireProvenance);
export type Statement = z.infer<typeof statementSchema>;

export const comparisonCellSchema = z.object({
  documentId: z.string().uuid(),
  value: z.string().nullable(),
  sources: z.array(sourceRefSchema).default([]),
  /** True when this cell differs from the majority value for the row. */
  outlier: z.boolean().default(false),
});
export type ComparisonCell = z.infer<typeof comparisonCellSchema>;

export const rowAgreementSchema = z.enum(['agree', 'differs', 'partial', 'single']);
export type RowAgreement = z.infer<typeof rowAgreementSchema>;

export const comparisonRowSchema = z.object({
  fieldKey: z.string(),
  label: z.string(),
  agreement: rowAgreementSchema,
  cells: z.array(comparisonCellSchema),
});
export type ComparisonRow = z.infer<typeof comparisonRowSchema>;

export const comparisonTableSchema = z.object({
  columns: z.array(
    z.object({
      documentId: z.string().uuid(),
      documentName: z.string(),
      detectedType: detectedTypeSchema,
    }),
  ),
  rows: z.array(comparisonRowSchema),
});
export type ComparisonTable = z.infer<typeof comparisonTableSchema>;

export const severitySchema = z.enum(['low', 'medium', 'high']);
export type Severity = z.infer<typeof severitySchema>;

export const discrepancySchema = z
  .object({
    id: z.string(),
    fieldKey: z.string(),
    label: z.string(),
    severity: severitySchema,
    /** What differs, in plain language. */
    description: z.string(),
    /** The conflicting values, one entry per document that supplied one. */
    values: z.array(
      z.object({
        documentId: z.string().uuid(),
        documentName: z.string(),
        value: z.string(),
        sources: z.array(sourceRefSchema).default([]),
      }),
    ),
    sources: z.array(sourceRefSchema).default([]),
    ...basisFields,
  })
  .superRefine(requireProvenance);
export type Discrepancy = z.infer<typeof discrepancySchema>;

export const missingFieldSchema = z.object({
  fieldKey: z.string(),
  label: z.string(),
  importance: severitySchema,
  reason: z.string(),
});
export type MissingField = z.infer<typeof missingFieldSchema>;

export const missingInformationSchema = z.object({
  documentId: z.string().uuid(),
  documentName: z.string(),
  detectedType: detectedTypeSchema,
  missing: z.array(missingFieldSchema),
});
export type MissingInformationReport = z.infer<typeof missingInformationSchema>;

export const keyValueEntrySchema = z.object({
  fieldKey: z.string(),
  label: z.string(),
  value: z.string(),
  category: z.string(),
  sources: z.array(sourceRefSchema).default([]),
  basis: findingBasisSchema.default('extracted'),
});
export type KeyValueEntry = z.infer<typeof keyValueEntrySchema>;

export const documentKeyValuesSchema = z.object({
  documentId: z.string().uuid(),
  documentName: z.string(),
  entries: z.array(keyValueEntrySchema),
});
export type DocumentKeyValues = z.infer<typeof documentKeyValuesSchema>;

export const perDocumentAnalysisSchema = z.object({
  documentId: z.string().uuid(),
  documentName: z.string(),
  detectedType: detectedTypeSchema,
  /** Counts of what the pipeline found, not an interpretation. */
  stats: z.object({
    factCount: z.number().int().nonnegative(),
    chunkCount: z.number().int().nonnegative(),
    pageCount: z.number().int().nonnegative().nullable(),
    rowCount: z.number().int().nonnegative().nullable(),
  }),
  statements: z.array(statementSchema),
  highlights: z.array(keyValueEntrySchema),
});
export type PerDocumentAnalysis = z.infer<typeof perDocumentAnalysisSchema>;

export const analysisWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  documentId: z.string().uuid().nullable().default(null),
});
export type AnalysisWarning = z.infer<typeof analysisWarningSchema>;

export const analysisIntentSchema = z.enum([
  'compare',
  'inconsistencies',
  'extract_dates',
  'extract_obligations',
  'extract_financials',
  'missing_information',
  'financial_position',
  'summarise',
]);
export type AnalysisIntent = z.infer<typeof analysisIntentSchema>;

export const analysisSectionSchema = z.enum([
  'summary',
  'comparisonTable',
  'discrepancies',
  'missingInformation',
  'keyValues',
  'perDocument',
]);
export type AnalysisSection = z.infer<typeof analysisSectionSchema>;

export const ANALYSIS_SECTION_LABELS: Record<AnalysisSection, string> = {
  summary: 'Summary',
  comparisonTable: 'Comparison table',
  discrepancies: 'Discrepancies',
  missingInformation: 'Missing information',
  keyValues: 'Key values',
  perDocument: 'Per document',
};

/**
 * The structured contract the provider must satisfy. The orchestrator parses
 * provider output through this schema before anything is persisted, exactly as
 * it would for a real model's JSON response.
 */
export const analysisResultSchema = z.object({
  schemaVersion: z.literal(1),
  prompt: z.string(),
  intents: z.array(analysisIntentSchema),
  /** Sections the instruction asked for, in display order. */
  sections: z.array(analysisSectionSchema),
  providerName: z.string(),
  generatedAt: z.string(),
  documents: z.array(
    z.object({
      documentId: z.string().uuid(),
      documentName: z.string(),
      detectedType: detectedTypeSchema,
    }),
  ),
  summary: z.object({
    headline: z.string(),
    statements: z.array(statementSchema),
  }),
  comparisonTable: comparisonTableSchema,
  discrepancies: z.array(discrepancySchema),
  missingInformation: z.array(missingInformationSchema),
  keyValues: z.array(documentKeyValuesSchema),
  perDocument: z.array(perDocumentAnalysisSchema),
  warnings: z.array(analysisWarningSchema),
});
export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export const analysisSummarySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  prompt: z.string(),
  status: analysisStatusSchema,
  documentIds: z.array(z.string().uuid()),
  error: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;

export const analysisDetailSchema = analysisSummarySchema.extend({
  result: analysisResultSchema.nullable(),
});
export type AnalysisDetail = z.infer<typeof analysisDetailSchema>;
