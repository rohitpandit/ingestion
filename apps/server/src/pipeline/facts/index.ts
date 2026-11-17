import type { FactCategory, SourceLocation } from '@mdiw/shared';
import { findChunkOrdinal } from '../chunker.js';
import { slugify } from '../normalize.js';
import type { Chunk, FactCandidate, RawDocument, TextLine } from '../types.js';
import { isNumericField, resolveField, type ResolvedField } from './field-map.js';
import { splitLabelValuePairs } from './label-value.js';
import {
  normalizeAddress,
  normalizeDate,
  normalizeGeneric,
  normalizeIdentifier,
  normalizeMoney,
  normalizeName,
} from './normalizers.js';
import { PATTERN_RULES } from './patterns.js';

/** Guard against pathological documents producing unbounded fact rows. */
const MAX_FACTS_PER_DOCUMENT = 4_000;
const SNIPPET_CHARS = 220;

function snippetOf(line: string): string {
  return line.length <= SNIPPET_CHARS ? line : `${line.slice(0, SNIPPET_CHARS - 1)}\u2026`;
}

/** The comparison form depends on what kind of value we are looking at. */
export function normalizeValue(category: FactCategory, raw: string): string | null {
  switch (category) {
    case 'date':
      return normalizeDate(raw);
    case 'money':
      return normalizeMoney(raw);
    case 'person_name':
    case 'company_name':
      return normalizeName(raw) || null;
    case 'address':
      return normalizeAddress(raw) || null;
    case 'licence_number':
    case 'identifier':
      return normalizeIdentifier(raw) || null;
    case 'email':
      return raw.toLowerCase().trim();
    case 'phone':
      return raw.replace(/[^\d+]/g, '') || null;
    default: {
      const money = normalizeMoney(raw);
      if (money && /^[-\d$£€₹]/.test(raw.trim())) return money;
      const date = normalizeDate(raw);
      if (date) return date;
      return normalizeGeneric(raw) || null;
    }
  }
}

function buildFact(
  field: ResolvedField,
  rawValue: string,
  location: SourceLocation,
  snippet: string,
  method: FactCandidate['method'],
  chunkOrdinal: number | null,
): FactCandidate {
  return {
    category: field.category,
    fieldKey: field.fieldKey,
    fieldLabel: field.label,
    entity: null,
    rawValue,
    normalizedValue: normalizeValue(field.category, rawValue),
    location,
    snippet,
    method,
    chunkOrdinal,
  };
}

function extractFromLines(lines: TextLine[], chunks: Chunk[]): FactCandidate[] {
  const facts: FactCandidate[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (facts.length >= MAX_FACTS_PER_DOCUMENT) break;
    const chunkOrdinal = findChunkOrdinal(chunks, line.location);
    const snippet = snippetOf(line.text);
    const pairs = splitLabelValuePairs(line.text);

    for (const pair of pairs) {
      const field = resolveField(pair.label);
      const key = `${field.fieldKey}|${pair.value}|${JSON.stringify(line.location)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push(buildFact(field, pair.value, line.location, snippet, 'label_match', chunkOrdinal));
    }

    // Unlabelled values still matter for date and amount extraction.
    for (const rule of PATTERN_RULES) {
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.pattern.exec(line.text)) !== null) {
        const rawValue = match[0].trim();
        if (rawValue.length < 3) continue;
        if (rule.category === 'phone' && !/\d{6,}/.test(rawValue.replace(/\D/g, ''))) continue;
        if (pairs.some((pair) => pair.value.includes(rawValue))) continue;

        const field: ResolvedField = {
          fieldKey: rule.fieldKey,
          label: rule.label,
          category: rule.category,
          year: null,
        };
        const key = `${field.fieldKey}|${rawValue}|${JSON.stringify(line.location)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        facts.push(buildFact(field, rawValue, line.location, snippet, 'regex', chunkOrdinal));
        if (facts.length >= MAX_FACTS_PER_DOCUMENT) break;
      }
    }
  }

  return facts;
}

const ENTITY_HEADERS = new Set([
  'company',
  'company name',
  'entity',
  'entity name',
  'business',
  'business name',
  'organisation',
  'organization',
  'name',
  'applicant',
  'applicant name',
  'borrower',
]);

function extractFromTable(raw: RawDocument, chunks: Chunk[]): FactCandidate[] {
  const table = raw.table;
  if (!table) return [];

  const headerFields = table.headers.map((header) => resolveField(header));
  const entityColumn = table.headers.findIndex((header) => ENTITY_HEADERS.has(slugify(header)));
  const periodColumn = headerFields.findIndex((field) => field.fieldKey === 'financials.period');

  const facts: FactCandidate[] = [];

  table.rows.forEach((row, index) => {
    if (facts.length >= MAX_FACTS_PER_DOCUMENT) return;
    const rowNumber = index + 1;
    const chunkOrdinal = findChunkOrdinal(chunks, { kind: 'csv', row: rowNumber });
    const entityRaw = entityColumn >= 0 ? (row[entityColumn] ?? '') : '';
    const entity = entityRaw ? normalizeName(entityRaw) || null : null;
    const periodValue = periodColumn >= 0 ? (row[periodColumn] ?? '') : '';
    const year = periodValue.match(/(19|20)\d{2}/)?.[0] ?? null;

    row.forEach((cell, column) => {
      const value = (cell ?? '').trim();
      if (value.length === 0) return;
      const header = table.headers[column] ?? `column_${column + 1}`;
      const base = headerFields[column] ?? resolveField(header);

      // A year column qualifies the measures on the same row, so two rows for
      // the same party in different years do not look like a contradiction.
      const qualified: ResolvedField =
        year && isNumericField(base.fieldKey) && !base.year
          ? {
              ...base,
              fieldKey: `${base.fieldKey}.${year}`,
              label: `${base.label} (${year})`,
              year,
            }
          : base;

      const location: SourceLocation = { kind: 'csv', row: rowNumber, column: header };
      const snippet = entityRaw
        ? `${entityRaw} - ${header}: ${value}`
        : `${header}: ${value}`;

      const fact = buildFact(qualified, value, location, snippet, 'header_match', chunkOrdinal);
      fact.entity = entity;
      facts.push(fact);
    });
  });

  return facts;
}

export interface FactExtractionResult {
  facts: FactCandidate[];
  primaryEntity: string | null;
}

/** Picks the party a document is mostly about, used to align facts later. */
function detectPrimaryEntity(facts: FactCandidate[]): string | null {
  const scored = new Map<string, { count: number; raw: string }>();
  for (const fact of facts) {
    if (fact.category !== 'company_name' && fact.category !== 'person_name') continue;
    if (!fact.normalizedValue) continue;
    const existing = scored.get(fact.normalizedValue);
    scored.set(fact.normalizedValue, {
      count: (existing?.count ?? 0) + (fact.category === 'company_name' ? 2 : 1),
      raw: existing?.raw ?? fact.rawValue,
    });
  }
  let best: { key: string; count: number } | null = null;
  for (const [key, value] of scored) {
    if (!best || value.count > best.count) best = { key, count: value.count };
  }
  return best?.key ?? null;
}

export function extractFacts(raw: RawDocument, chunks: Chunk[]): FactExtractionResult {
  const facts =
    raw.kind === 'csv'
      ? extractFromTable(raw, chunks)
      : extractFromLines(raw.segments.flatMap((segment) => segment.lines), chunks);

  const primaryEntity = detectPrimaryEntity(facts);

  if (raw.kind !== 'csv' && primaryEntity) {
    // Everything in a single-party document belongs to that party.
    for (const fact of facts) {
      fact.entity = primaryEntity;
    }
  }

  return { facts, primaryEntity };
}
