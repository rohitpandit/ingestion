import { z } from 'zod';
import { errorCodeSchema } from './errors.js';

/** Where inside its source document a piece of text lives. */
export const pdfLocationSchema = z.object({
  kind: z.literal('pdf'),
  page: z.number().int().positive(),
  pageEnd: z.number().int().positive().optional(),
  line: z.number().int().positive().optional(),
});

export const csvLocationSchema = z.object({
  kind: z.literal('csv'),
  /** 1-based data row (the header row is row 0). */
  row: z.number().int().nonnegative(),
  rowEnd: z.number().int().nonnegative().optional(),
  column: z.string().optional(),
});

export const sourceLocationSchema = z.discriminatedUnion('kind', [
  pdfLocationSchema,
  csvLocationSchema,
]);
export type SourceLocation = z.infer<typeof sourceLocationSchema>;

/** Human-readable rendering of a location, used in the UI and copied output. */
export function formatLocation(location: SourceLocation): string {
  if (location.kind === 'pdf') {
    const page =
      location.pageEnd && location.pageEnd !== location.page
        ? `pages ${location.page}-${location.pageEnd}`
        : `page ${location.page}`;
    return location.line ? `${page}, line ${location.line}` : page;
  }
  const row =
    location.rowEnd && location.rowEnd !== location.row
      ? `rows ${location.row}-${location.rowEnd}`
      : `row ${location.row}`;
  return location.column ? `${row}, column "${location.column}"` : row;
}

export const documentStatusSchema = z.enum(['queued', 'processing', 'ready', 'failed']);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentKindSchema = z.enum(['pdf', 'csv']);
export type DocumentKind = z.infer<typeof documentKindSchema>;

export const detectedTypeSchema = z.enum([
  'application_form',
  'financial_statement',
  'licence',
  'bank_statement',
  'tabular_data',
  'unknown',
]);
export type DetectedType = z.infer<typeof detectedTypeSchema>;

/** Lowercased type name with its article, for use mid-sentence. */
export function describeDetectedType(type: DetectedType): string {
  const label = DETECTED_TYPE_LABELS[type].toLowerCase();
  return `${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label}`;
}

export const DETECTED_TYPE_LABELS: Record<DetectedType, string> = {
  application_form: 'Application form',
  financial_statement: 'Financial statement',
  licence: 'Licence',
  bank_statement: 'Bank statement',
  tabular_data: 'Tabular data',
  unknown: 'Unclassified',
};

export const factCategorySchema = z.enum([
  'person_name',
  'company_name',
  'address',
  'date',
  'money',
  'licence_number',
  'email',
  'phone',
  'identifier',
  'key_value',
]);
export type FactCategory = z.infer<typeof factCategorySchema>;

export const factMethodSchema = z.enum(['regex', 'header_match', 'label_match']);
export type FactMethod = z.infer<typeof factMethodSchema>;

export const extractedFactSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  category: factCategorySchema,
  /** Canonical, comparable key such as `applicant.name` or `revenue.2025`. */
  fieldKey: z.string(),
  /** Label exactly as it appeared in the document, when there was one. */
  fieldLabel: z.string().nullable(),
  /**
   * Normalised name of the party the fact describes. PDFs inherit the
   * document's primary entity; CSV rows carry their own. Alignment across
   * documents happens on (fieldKey, entity).
   */
  entity: z.string().nullable(),
  rawValue: z.string(),
  /** Comparison-friendly form: ISO date, numeric amount, lowercased name. */
  normalizedValue: z.string().nullable(),
  location: sourceLocationSchema,
  snippet: z.string(),
  method: factMethodSchema,
});
export type ExtractedFact = z.infer<typeof extractedFactSchema>;

export const documentWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type DocumentWarning = z.infer<typeof documentWarningSchema>;

export const documentSummarySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  originalName: z.string(),
  kind: documentKindSchema,
  mime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  status: documentStatusSchema,
  detectedType: detectedTypeSchema,
  primaryEntity: z.string().nullable(),
  errorCode: errorCodeSchema.nullable(),
  errorMessage: z.string().nullable(),
  pageCount: z.number().int().nonnegative().nullable(),
  rowCount: z.number().int().nonnegative().nullable(),
  charCount: z.number().int().nonnegative().nullable(),
  factCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  warnings: z.array(documentWarningSchema),
  createdAt: z.string(),
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;

export const documentDetailSchema = documentSummarySchema.extend({
  facts: z.array(extractedFactSchema),
  preview: z.string(),
});
export type DocumentDetail = z.infer<typeof documentDetailSchema>;
