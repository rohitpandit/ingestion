import type { FactCategory } from '@mdiw/shared';
import { slugify } from '../normalize.js';

export interface FieldDefinition {
  fieldKey: string;
  label: string;
  category: FactCategory;
  /** Values of this field are compared numerically rather than as strings. */
  numeric?: boolean;
}

/**
 * Canonical fields. Every synonym on the left collapses to one key, which is
 * what makes the same concept comparable across differently worded documents.
 */
const SYNONYMS: Array<[string[], FieldDefinition]> = [
  [
    ['applicant name', 'name of applicant', 'full name', 'customer name', 'borrower name', 'applicant'],
    { fieldKey: 'applicant.name', label: 'Applicant name', category: 'person_name' },
  ],
  [
    ['date of birth', 'dob', 'birth date'],
    { fieldKey: 'applicant.dob', label: 'Date of birth', category: 'date' },
  ],
  [
    [
      'company name',
      'entity name',
      'registered name',
      'legal name',
      'business name',
      'trading name',
      'name of company',
      'company',
      'entity',
      'business',
    ],
    { fieldKey: 'company.name', label: 'Company name', category: 'company_name' },
  ],
  [
    ['registered address', 'business address', 'company address', 'address', 'principal place of business'],
    { fieldKey: 'address.registered', label: 'Registered address', category: 'address' },
  ],
  [
    ['residential address', 'home address', 'correspondence address'],
    { fieldKey: 'address.residential', label: 'Residential address', category: 'address' },
  ],
  [
    ['email', 'e mail', 'email address', 'contact email'],
    { fieldKey: 'contact.email', label: 'Email', category: 'email' },
  ],
  [
    ['phone', 'telephone', 'mobile', 'contact number', 'phone number'],
    { fieldKey: 'contact.phone', label: 'Phone', category: 'phone' },
  ],
  [
    [
      'licence number',
      'license number',
      'licence no',
      'license no',
      'trade licence number',
      'trade license number',
      'permit number',
    ],
    { fieldKey: 'licence.number', label: 'Licence number', category: 'licence_number' },
  ],
  [
    ['licence type', 'license type', 'licence category', 'permit type'],
    { fieldKey: 'licence.type', label: 'Licence type', category: 'key_value' },
  ],
  [
    ['issuing authority', 'issued by', 'authority', 'regulator'],
    { fieldKey: 'licence.authority', label: 'Issuing authority', category: 'key_value' },
  ],
  [
    ['licence expiry', 'license expiry', 'expiry date', 'valid until', 'valid till', 'expires on'],
    { fieldKey: 'licence.expiry', label: 'Licence expiry', category: 'date' },
  ],
  [
    ['issue date', 'date of issue', 'issued on', 'valid from'],
    { fieldKey: 'licence.issued', label: 'Licence issue date', category: 'date' },
  ],
  [
    [
      'registration number',
      'company registration number',
      'company number',
      'cin',
      'registration no',
      'incorporation number',
    ],
    { fieldKey: 'company.registration_number', label: 'Registration number', category: 'identifier' },
  ],
  [
    ['date of incorporation', 'incorporation date', 'incorporated on', 'established', 'founded'],
    { fieldKey: 'company.incorporated', label: 'Incorporation date', category: 'date' },
  ],
  [
    ['tax id', 'vat number', 'gst number', 'gstin', 'tin', 'pan', 'tax identification number'],
    { fieldKey: 'company.tax_id', label: 'Tax identifier', category: 'identifier' },
  ],
  [
    ['director', 'directors', 'authorised signatory', 'authorized signatory', 'proprietor', 'partner'],
    { fieldKey: 'company.director', label: 'Director or signatory', category: 'person_name' },
  ],
  [
    ['employees', 'number of employees', 'headcount', 'staff count'],
    { fieldKey: 'company.employees', label: 'Employees', category: 'key_value', numeric: true },
  ],
  [
    [
      'revenue',
      'total revenue',
      'turnover',
      'annual revenue',
      'annual turnover',
      'gross revenue',
      'net sales',
      'total income',
      'sales',
    ],
    { fieldKey: 'financials.revenue', label: 'Revenue', category: 'money', numeric: true },
  ],
  [
    ['gross profit'],
    { fieldKey: 'financials.gross_profit', label: 'Gross profit', category: 'money', numeric: true },
  ],
  [
    ['net profit', 'profit after tax', 'net income', 'profit', 'pat'],
    { fieldKey: 'financials.net_profit', label: 'Net profit', category: 'money', numeric: true },
  ],
  [
    ['total assets', 'assets'],
    { fieldKey: 'financials.total_assets', label: 'Total assets', category: 'money', numeric: true },
  ],
  [
    ['total liabilities', 'liabilities'],
    {
      fieldKey: 'financials.total_liabilities',
      label: 'Total liabilities',
      category: 'money',
      numeric: true,
    },
  ],
  [
    ['total equity', 'shareholders equity', 'net worth', 'equity'],
    { fieldKey: 'financials.equity', label: 'Equity', category: 'money', numeric: true },
  ],
  [
    ['financial year', 'fy', 'year ended', 'period', 'reporting period', 'year'],
    { fieldKey: 'financials.period', label: 'Reporting period', category: 'key_value' },
  ],
  [
    ['loan amount', 'amount requested', 'requested amount', 'facility amount', 'credit limit'],
    { fieldKey: 'loan.amount', label: 'Loan amount', category: 'money', numeric: true },
  ],
  [
    ['loan purpose', 'purpose of loan', 'purpose'],
    { fieldKey: 'loan.purpose', label: 'Loan purpose', category: 'key_value' },
  ],
  [
    ['loan term', 'tenure', 'term', 'repayment period'],
    { fieldKey: 'loan.term', label: 'Loan term', category: 'key_value' },
  ],
  [
    ['interest rate', 'rate of interest', 'apr'],
    { fieldKey: 'loan.interest_rate', label: 'Interest rate', category: 'key_value' },
  ],
  [
    ['monthly repayment', 'repayment', 'emi', 'instalment', 'installment'],
    { fieldKey: 'loan.repayment', label: 'Repayment', category: 'money', numeric: true },
  ],
  [
    ['collateral', 'security', 'security offered'],
    { fieldKey: 'loan.collateral', label: 'Collateral', category: 'key_value' },
  ],
  [
    ['account number', 'bank account number', 'a c no'],
    { fieldKey: 'bank.account_number', label: 'Account number', category: 'identifier' },
  ],
  [
    ['bank name', 'bank', 'banker'],
    { fieldKey: 'bank.name', label: 'Bank', category: 'key_value' },
  ],
  [
    ['ifsc', 'ifsc code', 'sort code', 'swift', 'swift code', 'routing number'],
    { fieldKey: 'bank.code', label: 'Bank code', category: 'identifier' },
  ],
  [
    ['opening balance'],
    { fieldKey: 'bank.opening_balance', label: 'Opening balance', category: 'money', numeric: true },
  ],
  [
    ['closing balance', 'balance'],
    { fieldKey: 'bank.closing_balance', label: 'Closing balance', category: 'money', numeric: true },
  ],
  [
    ['application date', 'date of application', 'submitted on'],
    { fieldKey: 'application.date', label: 'Application date', category: 'date' },
  ],
  [
    ['application number', 'application id', 'reference number', 'reference'],
    { fieldKey: 'application.reference', label: 'Application reference', category: 'identifier' },
  ],
];

const LOOKUP = new Map<string, FieldDefinition>();
for (const [synonyms, definition] of SYNONYMS) {
  for (const synonym of synonyms) {
    LOOKUP.set(synonym, definition);
  }
}

const DEFINITIONS_BY_KEY = new Map<string, FieldDefinition>();
for (const [, definition] of SYNONYMS) {
  DEFINITIONS_BY_KEY.set(definition.fieldKey, definition);
}

const YEAR_PATTERN = /\b(?:fy\s*)?(19|20)\d{2}\b/;

export interface ResolvedField extends FieldDefinition {
  /** Present when the label pinned the value to a year, e.g. "Revenue FY2024". */
  year: string | null;
}

/**
 * Resolves a document label onto a canonical field. Unrecognised labels are
 * kept as `other.*` key-values rather than discarded, so nothing is lost.
 */
export function resolveField(rawLabel: string): ResolvedField {
  const slug = slugify(rawLabel);
  const yearMatch = slug.match(YEAR_PATTERN);
  const year = yearMatch ? yearMatch[0].replace(/^fy\s*/, '') : null;
  const withoutYear = slug.replace(YEAR_PATTERN, '').replace(/\bfy\b/g, '').replace(/\s+/g, ' ').trim();

  const direct = LOOKUP.get(withoutYear) ?? LOOKUP.get(slug);
  if (direct) {
    return year
      ? { ...direct, fieldKey: `${direct.fieldKey}.${year}`, label: `${direct.label} (${year})`, year }
      : { ...direct, year: null };
  }

  const fallbackKey = withoutYear.length > 0 ? withoutYear : slug;
  return {
    fieldKey: `other.${fallbackKey.replace(/\s+/g, '_') || 'value'}`,
    label: titleCase(rawLabel),
    category: 'key_value',
    year,
  };
}

export function definitionForKey(fieldKey: string): FieldDefinition | undefined {
  const base = fieldKey.replace(/\.(19|20)\d{2}$/, '');
  return DEFINITIONS_BY_KEY.get(base) ?? DEFINITIONS_BY_KEY.get(fieldKey);
}

export function labelForKey(fieldKey: string): string {
  const yearMatch = fieldKey.match(/\.((?:19|20)\d{2})$/);
  const definition = definitionForKey(fieldKey);
  if (definition) {
    return yearMatch ? `${definition.label} (${yearMatch[1]})` : definition.label;
  }
  const tail = fieldKey.split('.').slice(1).join(' ').replace(/_/g, ' ');
  return titleCase(tail || fieldKey);
}

export function isNumericField(fieldKey: string): boolean {
  return definitionForKey(fieldKey)?.numeric === true;
}

export function titleCase(input: string): string {
  const cleaned = input.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
