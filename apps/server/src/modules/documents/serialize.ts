import type {
  DetectedType,
  DocumentDetail,
  DocumentKind,
  DocumentStatus,
  DocumentSummary,
  ErrorCode,
  ExtractedFact,
} from '@mdiw/shared';
import type { DocumentRow, FactRow } from '../../db/schema.js';

export function toDocumentSummary(row: DocumentRow, factCount: number): DocumentSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    originalName: row.originalName,
    kind: row.kind as DocumentKind,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    status: row.status as DocumentStatus,
    detectedType: row.detectedType as DetectedType,
    primaryEntity: row.primaryEntity,
    errorCode: (row.errorCode as ErrorCode | null) ?? null,
    errorMessage: row.errorMessage,
    pageCount: row.pageCount,
    rowCount: row.rowCount,
    charCount: row.charCount,
    factCount,
    truncated: row.truncated,
    warnings: row.warnings,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toFact(row: FactRow): ExtractedFact {
  return {
    id: row.id,
    documentId: row.documentId,
    category: row.category as ExtractedFact['category'],
    fieldKey: row.fieldKey,
    fieldLabel: row.fieldLabel,
    entity: row.entity,
    rawValue: row.rawValue,
    normalizedValue: row.normalizedValue,
    location: row.location,
    snippet: row.snippet,
    method: row.method as ExtractedFact['method'],
  };
}

export function toDocumentDetail(row: DocumentRow, facts: FactRow[]): DocumentDetail {
  return {
    ...toDocumentSummary(row, facts.length),
    facts: facts.map(toFact),
    preview: row.preview,
  };
}
