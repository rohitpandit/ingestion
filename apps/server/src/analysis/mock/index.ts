import type {
  AnalysisWarning,
  ComparisonRow,
  ComparisonTable,
  DocumentKeyValues,
  ExtractedFact,
  KeyValueEntry,
  MissingInformationReport,
  Statement,
} from '@mdiw/shared';
import { DETECTED_TYPE_LABELS, describeDetectedType, formatLocation } from '@mdiw/shared';
import { EXPECTED_FIELDS } from '../../pipeline/classify.js';
import { labelForKey } from '../../pipeline/facts/field-map.js';
import { OBLIGATION_PATTERN } from '../../pipeline/facts/patterns.js';
import type { ParsedInstruction } from '../instruction.js';
import type {
  CrossDocumentAnalysis,
  DocumentAnalysis,
  DocumentContext,
  LlmProvider,
} from '../provider.js';
import { alignFacts, titleiseEntity, type AlignedGroup } from './align.js';
import { buildDiscrepancies } from './discrepancies.js';
import { capitalise, listNames, makeId, plural, toSourceRef } from './format.js';

const MAX_KEY_VALUES = 40;
const MAX_HIGHLIGHTS = 8;
const MAX_TABLE_ROWS = 80;
const MAX_STATEMENTS = 10;

function matchesFocus(fieldKey: string, focusFields: string[]): boolean {
  return focusFields.some((focus) =>
    focus.endsWith('.') ? fieldKey.startsWith(focus) : fieldKey === focus || fieldKey.startsWith(`${focus}.`),
  );
}

/** Labelled facts carry the most meaning; regex hits are a fallback. */
function rankFacts(facts: ExtractedFact[], instruction: ParsedInstruction): ExtractedFact[] {
  return [...facts].sort((a, b) => scoreFact(b, instruction) - scoreFact(a, instruction));
}

function scoreFact(fact: ExtractedFact, instruction: ParsedInstruction): number {
  let score = 0;
  if (fact.method !== 'regex') score += 3;
  if (!fact.fieldKey.startsWith('other.') && !fact.fieldKey.startsWith('document.')) score += 2;
  if (matchesFocus(fact.fieldKey, instruction.focusFields)) score += 4;
  if (instruction.keywords.some((keyword) => fact.fieldKey.includes(keyword))) score += 2;
  if (fact.normalizedValue) score += 1;
  return score;
}

function dedupeKeyValues(facts: ExtractedFact[], documentName: string): KeyValueEntry[] {
  const seen = new Set<string>();
  const entries: KeyValueEntry[] = [];

  for (const fact of facts) {
    const identity = `${fact.fieldKey}|${fact.entity ?? ''}|${fact.normalizedValue ?? fact.rawValue}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    const scope = fact.entity ? ` - ${titleiseEntity(fact.entity)}` : '';
    entries.push({
      fieldKey: fact.fieldKey,
      label: `${fact.fieldLabel ?? labelForKey(fact.fieldKey)}${scope}`,
      value: fact.rawValue,
      category: fact.category,
      sources: [toSourceRef(fact, documentName)],
      basis: 'extracted',
    });
    if (entries.length >= MAX_KEY_VALUES) break;
  }

  return entries;
}

function buildMissingReport(context: DocumentContext): MissingInformationReport {
  const present = new Set(context.facts.map((fact) => fact.fieldKey.replace(/\.(19|20)\d{2}$/, '')));
  const expected = EXPECTED_FIELDS[context.detectedType] ?? [];

  return {
    documentId: context.documentId,
    documentName: context.documentName,
    detectedType: context.detectedType,
    missing: expected
      .filter((field) => !present.has(field.fieldKey))
      .map((field) => ({
        fieldKey: field.fieldKey,
        label: labelForKey(field.fieldKey),
        importance: field.importance,
        reason: `${capitalise(describeDetectedType(context.detectedType))} would normally state this, but no value was found in ${context.documentName}.`,
      })),
  };
}

function buildDocumentStatements(
  context: DocumentContext,
  instruction: ParsedInstruction,
  ranked: ExtractedFact[],
): Statement[] {
  const statements: Statement[] = [];

  if (context.detectedType !== 'unknown') {
    statements.push({
      id: makeId('doc-type', context.documentId),
      text: `${context.documentName} reads as ${describeDetectedType(context.detectedType)}.`,
      basis: 'interpreted',
      rationale:
        'Classified by scoring document-type keywords against the first pages and the set of fields that were found.',
      confidence: 0.7,
      sources: [],
    });
  }

  for (const fact of ranked.slice(0, 5)) {
    statements.push({
      id: makeId('doc-fact', context.documentId, fact.id),
      text: `${fact.fieldLabel ?? labelForKey(fact.fieldKey)} is stated as "${fact.rawValue}" (${formatLocation(fact.location)}).`,
      basis: 'extracted',
      rationale: null,
      confidence: null,
      sources: [toSourceRef(fact, context.documentName)],
    });
  }

  if (instruction.intents.includes('extract_obligations')) {
    const obligations = context.excerpts
      .flatMap((excerpt) =>
        excerpt.text.split('\n').map((line) => ({ line: line.trim(), location: excerpt.location })),
      )
      .filter((entry) => entry.line.length > 20 && OBLIGATION_PATTERN.test(entry.line))
      .slice(0, 5);

    for (const [index, entry] of obligations.entries()) {
      statements.push({
        id: makeId('doc-obligation', context.documentId, String(index)),
        text: entry.line,
        basis: 'extracted',
        rationale: null,
        confidence: null,
        sources: [
          {
            documentId: context.documentId,
            documentName: context.documentName,
            location: entry.location,
            snippet: entry.line.slice(0, 220),
            factId: null,
          },
        ],
      });
    }
  }

  return statements.slice(0, MAX_STATEMENTS);
}

function buildComparisonTable(
  analyses: DocumentAnalysis[],
  groups: AlignedGroup[],
  instruction: ParsedInstruction,
): ComparisonTable {
  const columns = analyses.map((analysis) => ({
    documentId: analysis.context.documentId,
    documentName: analysis.context.documentName,
    detectedType: analysis.context.detectedType,
  }));

  const interesting = groups.filter((group) => {
    if (group.values.length >= 2) return true;
    // A single-document value still earns a row if the user asked about it.
    if (matchesFocus(group.fieldKey, instruction.focusFields)) return true;
    return !group.fieldKey.startsWith('other.');
  });

  const rank = (group: AlignedGroup): number => {
    let score = 0;
    if (group.agreement === 'differs') score -= 4;
    if (matchesFocus(group.fieldKey, instruction.focusFields)) score -= 3;
    if (group.values.length >= 2) score -= 2;
    if (group.fieldKey.startsWith('other.')) score += 3;
    return score;
  };

  const rows: ComparisonRow[] = interesting
    .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
    .slice(0, MAX_TABLE_ROWS)
    .map((group) => {
      const majority = majorityValue(group);
      return {
        fieldKey: group.fieldKey,
        label: group.label,
        agreement: group.agreement,
        cells: columns.map((column) => {
          const value = group.values.find((candidate) => candidate.documentId === column.documentId);
          return {
            documentId: column.documentId,
            value: value?.rawValue ?? null,
            sources: value?.sources ?? [],
            outlier:
              group.agreement === 'differs' && value !== undefined && value.normalizedValue !== majority,
          };
        }),
      };
    });

  return { columns, rows };
}

function majorityValue(group: AlignedGroup): string | null {
  const counts = new Map<string, number>();
  for (const value of group.values) {
    counts.set(value.normalizedValue, (counts.get(value.normalizedValue) ?? 0) + 1);
  }
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count };
  }
  return best && best.count > 1 ? best.value : null;
}

function buildSummary(
  analyses: DocumentAnalysis[],
  groups: AlignedGroup[],
  discrepancyCount: number,
  instruction: ParsedInstruction,
): { headline: string; statements: Statement[] } {
  const statements: Statement[] = [];
  const shared = groups.filter((group) => group.values.length >= 2);
  const agreeing = shared.filter((group) => group.agreement === 'agree' || group.agreement === 'partial');
  const missingCount = analyses.reduce((total, analysis) => total + analysis.missing.missing.length, 0);

  const headline =
    `Reviewed ${plural(analyses.length, 'document')}: ` +
    `${plural(shared.length, 'field')} appear in more than one document, ` +
    `${plural(discrepancyCount, 'conflict')} found, ` +
    `${plural(missingCount, 'expected field')} not stated.`;

  statements.push({
    id: makeId('summary', 'coverage'),
    text: `Each document was read on its own first: ${listNames(
      analyses.map(
        (analysis) =>
          `${analysis.context.documentName} (${DETECTED_TYPE_LABELS[analysis.context.detectedType].toLowerCase()}, ${plural(analysis.context.facts.length, 'value')})`,
      ),
      6,
    )}.`,
    basis: 'interpreted',
    rationale: 'Counts come from the extraction pipeline; the document type is the classifier output.',
    confidence: 0.9,
    sources: [],
  });

  if (shared.length > 0) {
    statements.push({
      id: makeId('summary', 'overlap'),
      text:
        discrepancyCount === 0
          ? `All ${shared.length} overlapping fields agree once values are normalised.`
          : `${plural(discrepancyCount, 'overlapping field')} disagree between documents; ${agreeing.length} agree.`,
      basis: 'interpreted',
      rationale:
        'Values were aligned on a canonical field key and party, then compared after normalising dates, amounts, names and identifiers.',
      confidence: 0.85,
      sources: [],
    });
  }

  for (const group of agreeing.slice(0, 4)) {
    const first = group.values[0];
    if (!first) continue;
    statements.push({
      id: makeId('summary', 'agree', group.fieldKey, group.entity ?? ''),
      text: `${group.label} is consistently recorded as "${first.rawValue}" across ${plural(group.values.length, 'document')}.`,
      basis: 'interpreted',
      rationale: 'The normalised values from each document matched exactly.',
      confidence: 0.9,
      sources: group.values.flatMap((value) => value.sources.slice(0, 1)),
    });
  }

  if (instruction.intents.includes('financial_position')) {
    statements.push(...financialPositionStatements(groups));
  }

  return { headline, statements: statements.slice(0, MAX_STATEMENTS) };
}

/** Side-by-side read of the headline financial fields, per party. */
function financialPositionStatements(groups: AlignedGroup[]): Statement[] {
  const byEntity = new Map<string, AlignedGroup[]>();
  for (const group of groups) {
    if (!group.fieldKey.startsWith('financials.')) continue;
    const key = group.entity ?? '';
    const bucket = byEntity.get(key) ?? [];
    bucket.push(group);
    byEntity.set(key, bucket);
  }

  const statements: Statement[] = [];
  for (const [entity, entityGroups] of byEntity) {
    const parts = entityGroups
      .slice(0, 6)
      .map((group) => `${group.label.split(' - ')[0]}: ${group.values[0]?.rawValue ?? 'not stated'}`);
    if (parts.length === 0) continue;
    statements.push({
      id: makeId('summary', 'financial', entity || 'unattributed'),
      text: `${entity ? titleiseEntity(entity) : 'Unattributed figures'} - ${parts.join('; ')}.`,
      basis: 'interpreted',
      rationale: 'Financial fields were grouped by the party they are attributed to and listed side by side.',
      confidence: 0.75,
      sources: entityGroups.flatMap((group) => group.values.flatMap((value) => value.sources.slice(0, 1))).slice(0, 8),
    });
  }

  return statements.slice(0, 4);
}

function buildWarnings(analyses: DocumentAnalysis[], groups: AlignedGroup[]): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];

  for (const analysis of analyses) {
    const { context } = analysis;
    if (context.truncated) {
      warnings.push({
        code: 'TRUNCATED_SOURCE',
        message: `${context.documentName} was too large to read in full, so findings may be incomplete.`,
        documentId: context.documentId,
      });
    }
    if (context.facts.length === 0) {
      warnings.push({
        code: 'NO_FACTS',
        message: `No structured values could be extracted from ${context.documentName}; only its text was considered.`,
        documentId: context.documentId,
      });
    }
  }

  const unattributed = groups.filter((group) => group.entity === null && group.values.length >= 2);
  if (unattributed.length > 0 && analyses.some((analysis) => analysis.context.primaryEntity === null)) {
    warnings.push({
      code: 'UNATTRIBUTED_VALUES',
      message:
        'Some documents did not name the party they describe, so their values were compared without an entity check.',
      documentId: null,
    });
  }

  return warnings;
}

/**
 * Deterministic stand-in for a language model. It implements the same
 * interface a hosted model would, so swapping it out does not touch the
 * orchestrator, the API, or the frontend.
 */
export class MockRuleBasedProvider implements LlmProvider {
  readonly name = 'mock-rule-based';

  async analyzeDocument(
    context: DocumentContext,
    instruction: ParsedInstruction,
  ): Promise<DocumentAnalysis> {
    const ranked = rankFacts(context.facts, instruction);
    const keyValueEntries = dedupeKeyValues(ranked, context.documentName);

    const keyValues: DocumentKeyValues = {
      documentId: context.documentId,
      documentName: context.documentName,
      entries: keyValueEntries,
    };

    return {
      context,
      keyValues,
      missing: buildMissingReport(context),
      perDocument: {
        documentId: context.documentId,
        documentName: context.documentName,
        detectedType: context.detectedType,
        stats: {
          factCount: context.facts.length,
          chunkCount: context.chunkCount,
          pageCount: context.pageCount,
          rowCount: context.rowCount,
        },
        statements: buildDocumentStatements(context, instruction, ranked),
        highlights: keyValueEntries.slice(0, MAX_HIGHLIGHTS),
      },
    };
  }

  async synthesize(
    analyses: DocumentAnalysis[],
    instruction: ParsedInstruction,
  ): Promise<CrossDocumentAnalysis> {
    const groups = alignFacts(analyses);
    const discrepancies = buildDiscrepancies(groups);
    const { headline, statements } = buildSummary(analyses, groups, discrepancies.length, instruction);

    return {
      headline,
      statements,
      comparisonTable: buildComparisonTable(analyses, groups, instruction),
      discrepancies,
      warnings: buildWarnings(analyses, groups),
    };
  }
}
