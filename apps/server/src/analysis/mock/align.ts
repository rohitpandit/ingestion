import type { ExtractedFact, RowAgreement, SourceRef } from '@mdiw/shared';
import { labelForKey } from '../../pipeline/facts/field-map.js';
import type { DocumentAnalysis } from '../provider.js';
import { toSourceRef } from './format.js';
import { canonicalizeEntities } from './similarity.js';

/** Catch-all keys are useful per document but meaningless to line up. */
const UNCOMPARABLE_PREFIXES = ['document.'];
const MAX_VALUES_PER_CELL = 3;

export interface AlignedValue {
  documentId: string;
  documentName: string;
  rawValue: string;
  normalizedValue: string;
  sources: SourceRef[];
  /** True when one document states more than one value for this field. */
  internallyInconsistent: boolean;
}

export interface AlignedGroup {
  fieldKey: string;
  label: string;
  entity: string | null;
  values: AlignedValue[];
  agreement: RowAgreement;
}

function comparable(fieldKey: string): boolean {
  return !UNCOMPARABLE_PREFIXES.some((prefix) => fieldKey.startsWith(prefix));
}

function pickRepresentative(
  facts: ExtractedFact[],
  documentId: string,
  documentName: string,
): AlignedValue {
  const byNormalized = new Map<string, ExtractedFact[]>();
  for (const fact of facts) {
    const key = fact.normalizedValue ?? fact.rawValue.toLowerCase();
    const bucket = byNormalized.get(key);
    if (bucket) bucket.push(fact);
    else byNormalized.set(key, [fact]);
  }

  // Most-supported value first, so a single stray match cannot dominate.
  const ordered = Array.from(byNormalized.entries()).sort((a, b) => b[1].length - a[1].length);
  const chosen = ordered.slice(0, MAX_VALUES_PER_CELL);

  return {
    documentId,
    documentName,
    rawValue: chosen.map(([, group]) => group[0]?.rawValue ?? '').join(' / '),
    normalizedValue: chosen.map(([normalized]) => normalized).join(' / '),
    sources: chosen.flatMap(([, group]) => group.slice(0, 2).map((fact) => toSourceRef(fact, documentName))),
    internallyInconsistent: ordered.length > 1,
  };
}

function agreementOf(values: AlignedValue[], totalDocuments: number): RowAgreement {
  if (values.length < 2) return 'single';
  const distinct = new Set(values.map((value) => value.normalizedValue));
  if (distinct.size > 1) return 'differs';
  return values.length === totalDocuments ? 'agree' : 'partial';
}

/**
 * Lines facts up across documents on (canonical field, canonical entity). This
 * is the reduce step: no document text is merged, only comparable values.
 */
export function alignFacts(analyses: DocumentAnalysis[]): AlignedGroup[] {
  const entityMapping = canonicalizeEntities(
    analyses.flatMap((analysis) => analysis.context.facts.map((fact) => fact.entity ?? '')),
  );

  const groups = new Map<string, { fieldKey: string; entity: string | null; byDocument: Map<string, ExtractedFact[]> }>();
  const documentNames = new Map<string, string>();

  for (const analysis of analyses) {
    documentNames.set(analysis.context.documentId, analysis.context.documentName);
    for (const fact of analysis.context.facts) {
      if (!comparable(fact.fieldKey)) continue;
      const entity = fact.entity ? (entityMapping.get(fact.entity) ?? fact.entity) : null;
      const key = `${fact.fieldKey}\u0000${entity ?? ''}`;
      let group = groups.get(key);
      if (!group) {
        group = { fieldKey: fact.fieldKey, entity, byDocument: new Map() };
        groups.set(key, group);
      }
      const bucket = group.byDocument.get(fact.documentId);
      if (bucket) bucket.push(fact);
      else group.byDocument.set(fact.documentId, [fact]);
    }
  }

  // Count the distinct entities per field so labels only disambiguate when needed.
  const entitiesByField = new Map<string, Set<string>>();
  for (const group of groups.values()) {
    if (!group.entity) continue;
    const set = entitiesByField.get(group.fieldKey) ?? new Set<string>();
    set.add(group.entity);
    entitiesByField.set(group.fieldKey, set);
  }

  const result: AlignedGroup[] = [];

  for (const group of groups.values()) {
    const values = Array.from(group.byDocument.entries()).map(([documentId, facts]) =>
      pickRepresentative(facts, documentId, documentNames.get(documentId) ?? 'Document'),
    );
    const needsEntity = (entitiesByField.get(group.fieldKey)?.size ?? 0) > 1;
    const baseLabel = labelForKey(group.fieldKey);

    result.push({
      fieldKey: group.fieldKey,
      label: needsEntity && group.entity ? `${baseLabel} - ${titleiseEntity(group.entity)}` : baseLabel,
      entity: group.entity,
      values,
      agreement: agreementOf(values, analyses.length),
    });
  }

  return result;
}

/** Entity keys are normalised to lowercase; restore something presentable. */
export function titleiseEntity(entity: string): string {
  return entity
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
