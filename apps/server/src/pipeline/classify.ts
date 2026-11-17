import type { DetectedType } from '@mdiw/shared';
import type { FactCandidate, RawDocument } from './types.js';

interface TypeRule {
  type: DetectedType;
  keywords: Array<[RegExp, number]>;
  fieldKeys?: string[];
}

const RULES: TypeRule[] = [
  {
    type: 'application_form',
    keywords: [
      [/\bapplication form\b/i, 5],
      [/\bloan application\b/i, 5],
      [/\bapplicant\b/i, 2],
      [/\bi hereby apply\b/i, 4],
      [/\bdeclaration\b/i, 1],
      [/\bsignature of applicant\b/i, 3],
    ],
    fieldKeys: ['applicant.name', 'loan.amount', 'application.reference'],
  },
  {
    type: 'financial_statement',
    keywords: [
      [/\bbalance sheet\b/i, 5],
      [/\bprofit and loss\b/i, 5],
      [/\bincome statement\b/i, 5],
      [/\bfinancial statements?\b/i, 4],
      [/\btotal assets\b/i, 3],
      [/\bturnover\b/i, 2],
    ],
    fieldKeys: ['financials.revenue', 'financials.total_assets', 'financials.net_profit'],
  },
  {
    type: 'licence',
    keywords: [
      [/\btrade licen[cs]e\b/i, 5],
      [/\blicen[cs]e\b/i, 3],
      [/\bpermit\b/i, 2],
      [/\bissuing authority\b/i, 3],
      [/\bvalid until\b/i, 2],
    ],
    fieldKeys: ['licence.number', 'licence.expiry', 'licence.authority'],
  },
  {
    type: 'bank_statement',
    keywords: [
      [/\bstatement of account\b/i, 5],
      [/\bbank statement\b/i, 5],
      [/\bopening balance\b/i, 3],
      [/\bclosing balance\b/i, 3],
      [/\bdebit\b/i, 1],
      [/\bcredit\b/i, 1],
    ],
    fieldKeys: ['bank.account_number', 'bank.closing_balance'],
  },
];

const MIN_SCORE = 4;

/**
 * Keyword and field scoring over the first pages of a document. The result
 * drives the missing-information report, so it is deliberately conservative:
 * a weak signal stays `unknown` rather than guessing.
 */
export function classifyDocument(raw: RawDocument, facts: FactCandidate[]): DetectedType {
  const sample = raw.segments
    .slice(0, 5)
    .map((segment) => segment.text)
    .join('\n')
    .slice(0, 20_000);

  const presentKeys = new Set(facts.map((fact) => fact.fieldKey.replace(/\.(19|20)\d{2}$/, '')));

  let best: { type: DetectedType; score: number } | null = null;

  for (const rule of RULES) {
    let score = 0;
    for (const [pattern, weight] of rule.keywords) {
      if (pattern.test(sample)) score += weight;
    }
    for (const key of rule.fieldKeys ?? []) {
      if (presentKeys.has(key)) score += 2;
    }
    if (!best || score > best.score) best = { type: rule.type, score };
  }

  if (best && best.score >= MIN_SCORE) return best.type;
  return raw.kind === 'csv' ? 'tabular_data' : 'unknown';
}

/** Fields a reader would expect each document type to state. */
export const EXPECTED_FIELDS: Record<DetectedType, Array<{ fieldKey: string; importance: 'low' | 'medium' | 'high' }>> = {
  application_form: [
    { fieldKey: 'applicant.name', importance: 'high' },
    { fieldKey: 'address.residential', importance: 'medium' },
    { fieldKey: 'contact.email', importance: 'low' },
    { fieldKey: 'contact.phone', importance: 'low' },
    { fieldKey: 'loan.amount', importance: 'high' },
    { fieldKey: 'loan.purpose', importance: 'medium' },
    { fieldKey: 'loan.term', importance: 'medium' },
    { fieldKey: 'application.date', importance: 'medium' },
  ],
  financial_statement: [
    { fieldKey: 'company.name', importance: 'high' },
    { fieldKey: 'financials.period', importance: 'high' },
    { fieldKey: 'financials.revenue', importance: 'high' },
    { fieldKey: 'financials.net_profit', importance: 'medium' },
    { fieldKey: 'financials.total_assets', importance: 'medium' },
    { fieldKey: 'financials.total_liabilities', importance: 'medium' },
  ],
  licence: [
    { fieldKey: 'company.name', importance: 'high' },
    { fieldKey: 'licence.number', importance: 'high' },
    { fieldKey: 'licence.issued', importance: 'medium' },
    { fieldKey: 'licence.expiry', importance: 'high' },
    { fieldKey: 'licence.authority', importance: 'medium' },
    { fieldKey: 'address.registered', importance: 'medium' },
  ],
  bank_statement: [
    { fieldKey: 'bank.account_number', importance: 'high' },
    { fieldKey: 'bank.name', importance: 'medium' },
    { fieldKey: 'bank.opening_balance', importance: 'medium' },
    { fieldKey: 'bank.closing_balance', importance: 'high' },
  ],
  tabular_data: [],
  unknown: [],
};
