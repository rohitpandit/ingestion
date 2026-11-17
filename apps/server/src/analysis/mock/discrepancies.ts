import type { Discrepancy, Severity, SourceRef } from '@mdiw/shared';
import { parseMoney } from '../../pipeline/facts/normalizers.js';
import { definitionForKey } from '../../pipeline/facts/field-map.js';
import type { AlignedGroup } from './align.js';
import { listNames, makeId } from './format.js';
import { similarity } from './similarity.js';

const IDENTITY_FIELDS = new Set([
  'licence.number',
  'company.registration_number',
  'bank.account_number',
  'company.tax_id',
  'contact.email',
  'bank.code',
  'application.reference',
]);

/**
 * Fields that scope other values rather than assert one of their own. A
 * statement covering FY2025 and a table covering 2025 and 2024 are not in
 * conflict, so they are not reported as such.
 */
const SCOPING_FIELDS = new Set(['financials.period']);

function baseKey(fieldKey: string): string {
  return fieldKey.replace(/\.(19|20)\d{2}$/, '');
}

interface Assessment {
  severity: Severity;
  rationale: string;
  confidence: number;
}

/** How serious a mismatch is depends on what kind of field disagrees. */
function assess(group: AlignedGroup): Assessment {
  const key = baseKey(group.fieldKey);
  const definition = definitionForKey(group.fieldKey);
  const values = group.values.map((value) => value.normalizedValue);

  if (IDENTITY_FIELDS.has(key)) {
    return {
      severity: 'high',
      rationale:
        'Identifiers were normalised (case and punctuation removed) and still differ, so they cannot refer to the same record.',
      confidence: 0.95,
    };
  }

  if (definition?.numeric) {
    const amounts = group.values
      .map((value) => parseMoney(value.rawValue)?.amount)
      .filter((amount): amount is number => typeof amount === 'number');
    if (amounts.length >= 2) {
      const max = Math.max(...amounts);
      const min = Math.min(...amounts);
      const spread = max === 0 ? 1 : Math.abs(max - min) / Math.abs(max);
      return {
        severity: spread > 0.1 ? 'high' : 'medium',
        rationale: `Amounts were parsed to numbers and differ by ${(spread * 100).toFixed(1)}% between the highest and lowest figure.`,
        confidence: spread > 0.1 ? 0.9 : 0.7,
      };
    }
  }

  if (definition?.category === 'date') {
    return {
      severity: 'high',
      rationale: 'Dates were normalised to ISO format before comparison, so the difference is not a formatting artefact.',
      confidence: 0.9,
    };
  }

  if (definition?.category === 'person_name' || definition?.category === 'company_name' || definition?.category === 'address') {
    const score = values.length >= 2 ? similarity(values[0] ?? '', values[1] ?? '') : 0;
    return score >= 0.65
      ? {
          severity: 'medium',
          rationale: `The values are ${(score * 100).toFixed(0)}% similar after removing titles, suffixes and punctuation, which suggests a spelling variation rather than a different party.`,
          confidence: 0.6,
        }
      : {
          severity: 'high',
          rationale: `The values are only ${(score * 100).toFixed(0)}% similar after normalisation, so they look like genuinely different entries.`,
          confidence: 0.85,
        };
  }

  if (group.fieldKey.startsWith('other.')) {
    return {
      severity: 'low',
      rationale: 'This label was not recognised as a standard field, so the mismatch may simply reflect different wording.',
      confidence: 0.4,
    };
  }

  return {
    severity: 'medium',
    rationale: 'The normalised values differ across documents.',
    confidence: 0.7,
  };
}

/**
 * Turns conflicting aligned groups into discrepancies. The conflicting values
 * stay extracted and traceable; only the judgement that they conflict, and how
 * badly, is marked as an interpretation.
 */
export function buildDiscrepancies(groups: AlignedGroup[]): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];

  for (const group of groups) {
    if (group.agreement !== 'differs') continue;
    if (SCOPING_FIELDS.has(baseKey(group.fieldKey))) continue;

    const assessment = assess(group);
    const sources: SourceRef[] = group.values.flatMap((value) => value.sources);
    const where = listNames(group.values.map((value) => `"${value.rawValue}" in ${value.documentName}`), 4);

    discrepancies.push({
      id: makeId('discrepancy', group.fieldKey, group.entity ?? ''),
      fieldKey: group.fieldKey,
      label: group.label,
      severity: assessment.severity,
      description: `${group.label} does not match across ${group.values.length} documents: ${where}.`,
      values: group.values.map((value) => ({
        documentId: value.documentId,
        documentName: value.documentName,
        value: value.rawValue,
        sources: value.sources,
      })),
      sources,
      basis: 'interpreted',
      rationale: assessment.rationale,
      confidence: assessment.confidence,
    });
  }

  discrepancies.push(...currencyMismatches(groups));

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return discrepancies.sort((a, b) => order[a.severity] - order[b.severity] || a.label.localeCompare(b.label));
}

/**
 * Amounts are compared as numbers, so an agreeing row could still mix
 * currencies. That is caught here rather than being silently accepted.
 */
function currencyMismatches(groups: AlignedGroup[]): Discrepancy[] {
  const found: Discrepancy[] = [];

  for (const group of groups) {
    if (group.agreement === 'differs' || group.values.length < 2) continue;
    if (!definitionForKey(group.fieldKey)?.numeric) continue;

    const currencies = group.values.map((value) => ({
      value,
      currency: parseMoney(value.rawValue)?.currency ?? null,
    }));
    const named = currencies.filter((entry) => entry.currency !== null);
    const distinct = new Set(named.map((entry) => entry.currency));
    if (named.length < 2 || distinct.size < 2) continue;

    found.push({
      id: makeId('currency', group.fieldKey, group.entity ?? ''),
      fieldKey: group.fieldKey,
      label: group.label,
      severity: 'high',
      description: `${group.label} has the same amount in every document but is denominated in different currencies: ${listNames(
        named.map((entry) => `${entry.currency} in ${entry.value.documentName}`),
        4,
      )}.`,
      values: named.map((entry) => ({
        documentId: entry.value.documentId,
        documentName: entry.value.documentName,
        value: entry.value.rawValue,
        sources: entry.value.sources,
      })),
      sources: named.flatMap((entry) => entry.value.sources),
      basis: 'interpreted',
      rationale: 'Amounts are compared numerically, so the figures match; the currency symbols attached to them do not.',
      confidence: 0.8,
    });
  }

  return found;
}
