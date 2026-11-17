import type { AnalysisIntent, AnalysisSection } from '@mdiw/shared';

export interface ParsedInstruction {
  prompt: string;
  intents: AnalysisIntent[];
  sections: AnalysisSection[];
  /** Canonical field prefixes the user called out, used to rank content. */
  focusFields: string[];
  /** Words from the prompt used to score which chunks are relevant. */
  keywords: string[];
}

interface IntentRule {
  intent: AnalysisIntent;
  patterns: RegExp[];
  sections: AnalysisSection[];
  focusFields?: string[];
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'compare',
    patterns: [/\bcompare\b/i, /\bcomparison\b/i, /\bacross (?:all )?(?:the )?documents\b/i, /\bside by side\b/i],
    sections: ['comparisonTable', 'summary'],
  },
  {
    intent: 'inconsistencies',
    patterns: [
      /\binconsistenc/i,
      /\bdiscrepanc/i,
      /\bconflict/i,
      /\bmismatch/i,
      /\bdisagree/i,
      /\bcontradict/i,
      /\bhighlight differences\b/i,
    ],
    sections: ['discrepancies', 'comparisonTable', 'summary'],
  },
  {
    intent: 'missing_information',
    patterns: [/\bmissing\b/i, /\bincomplete\b/i, /\bnot provided\b/i, /\bgaps?\b/i, /\babsent\b/i],
    sections: ['missingInformation', 'summary'],
  },
  {
    intent: 'extract_dates',
    patterns: [/\bdates?\b/i, /\bdeadlines?\b/i, /\bexpiry\b/i, /\bvalidity\b/i, /\btimeline\b/i],
    sections: ['keyValues', 'summary'],
    focusFields: ['licence.expiry', 'licence.issued', 'application.date', 'applicant.dob', 'document.date'],
  },
  {
    intent: 'extract_obligations',
    patterns: [/\bobligation/i, /\bcovenant/i, /\bcommitment/i, /\bundertaking/i, /\bterms?\b/i],
    sections: ['keyValues', 'perDocument', 'summary'],
    focusFields: ['loan.term', 'loan.repayment', 'loan.interest_rate', 'loan.collateral'],
  },
  {
    intent: 'extract_financials',
    patterns: [/\bfinancial values?\b/i, /\bamounts?\b/i, /\bfigures?\b/i, /\bvalues?\b/i, /\bmonetary\b/i],
    sections: ['keyValues', 'summary'],
    focusFields: ['financials.', 'loan.amount', 'bank.'],
  },
  {
    intent: 'financial_position',
    patterns: [/\bfinancial position\b/i, /\bfinancial health\b/i, /\bbalance sheet\b/i, /\bprofitab/i, /\brevenue\b/i, /\bturnover\b/i],
    sections: ['comparisonTable', 'summary', 'keyValues'],
    focusFields: ['financials.'],
  },
  {
    intent: 'summarise',
    patterns: [/\bsummar/i, /\boverview\b/i, /\bconsolidat/i, /\bkey (?:points|insights|takeaways)\b/i],
    sections: ['summary', 'perDocument'],
  },
];

/** Prompt words that steer which canonical fields matter. */
const FOCUS_TERMS: Array<[RegExp, string[]]> = [
  [/\bnames?\b/i, ['applicant.name', 'company.name', 'company.director']],
  [/\baddress(?:es)?\b/i, ['address.']],
  [/\blicen[cs]e\b/i, ['licence.']],
  [/\brevenue\b|\bturnover\b|\bsales\b/i, ['financials.revenue']],
  [/\bprofit\b/i, ['financials.net_profit', 'financials.gross_profit']],
  [/\bassets?\b|\bliabilit/i, ['financials.total_assets', 'financials.total_liabilities']],
  [/\bloan\b|\bfacility\b|\bcredit\b/i, ['loan.']],
  [/\bbank\b|\baccount\b|\bbalance\b/i, ['bank.']],
  [/\bcompan(?:y|ies)\b|\bentit/i, ['company.']],
  [/\btax\b|\bgst\b|\bvat\b/i, ['company.tax_id']],
];

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'these', 'those', 'all', 'any', 'are',
  'between', 'across', 'into', 'about', 'their', 'there', 'which', 'what', 'when', 'where',
  'identify', 'compare', 'extract', 'highlight', 'please', 'show', 'give', 'list', 'provide',
  'documents', 'document', 'uploaded', 'upload', 'information', 'details', 'each', 'other',
]);

const DEFAULT_SECTIONS: AnalysisSection[] = ['summary', 'keyValues', 'perDocument'];
const SECTION_ORDER: AnalysisSection[] = [
  'summary',
  'comparisonTable',
  'discrepancies',
  'missingInformation',
  'keyValues',
  'perDocument',
];

/**
 * Turns a free-text instruction into the intents and sections that drive the
 * run. Anything unmatched falls back to a summary plus key values rather than
 * returning nothing.
 */
export function parseInstruction(prompt: string): ParsedInstruction {
  const trimmed = prompt.trim();
  const intents: AnalysisIntent[] = [];
  const sections = new Set<AnalysisSection>();
  const focusFields = new Set<string>();

  for (const rule of INTENT_RULES) {
    if (!rule.patterns.some((pattern) => pattern.test(trimmed))) continue;
    intents.push(rule.intent);
    for (const section of rule.sections) sections.add(section);
    for (const field of rule.focusFields ?? []) focusFields.add(field);
  }

  for (const [pattern, fields] of FOCUS_TERMS) {
    if (!pattern.test(trimmed)) continue;
    for (const field of fields) focusFields.add(field);
  }

  if (intents.length === 0) {
    intents.push('summarise');
    for (const section of DEFAULT_SECTIONS) sections.add(section);
  }

  // Per-document detail is always available; it is the traceable backbone.
  sections.add('perDocument');

  const keywords = Array.from(
    new Set(
      trimmed
        .toLowerCase()
        .split(/[^a-z0-9.]+/)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
    ),
  );

  return {
    prompt: trimmed,
    intents,
    sections: SECTION_ORDER.filter((section) => sections.has(section)),
    focusFields: Array.from(focusFields),
    keywords,
  };
}
