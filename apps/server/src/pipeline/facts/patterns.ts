import type { FactCategory } from '@mdiw/shared';

export interface PatternRule {
  category: FactCategory;
  fieldKey: string;
  label: string;
  pattern: RegExp;
}

/**
 * Standalone values worth capturing even when no label precedes them. These
 * back the "extract key dates / financial values" instructions.
 */
export const PATTERN_RULES: PatternRule[] = [
  {
    category: 'email',
    fieldKey: 'contact.email',
    label: 'Email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    category: 'phone',
    fieldKey: 'contact.phone',
    label: 'Phone',
    pattern: /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{3,5}[\s-]?\d{3,4}[\s-]?\d{0,4}/g,
  },
  {
    category: 'date',
    fieldKey: 'document.date',
    label: 'Date',
    pattern:
      /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/gi,
  },
  {
    category: 'money',
    fieldKey: 'document.amount',
    label: 'Monetary value',
    pattern:
      /(?:[$£€₹]|\b(?:USD|GBP|EUR|INR|Rs\.?)\s?)\s?-?\d[\d,]*(?:\.\d{1,2})?(?:\s?(?:k|m|mn|bn|million|billion|lakh|crore))?\b/gi,
  },
  {
    category: 'licence_number',
    fieldKey: 'licence.number',
    label: 'Licence number',
    pattern: /\b(?:LIC|TL|REG|CIN|GST|VAT|ABN)[-/ ]?[A-Z0-9][A-Z0-9-]{4,20}\b/g,
  },
];

/** Obligation language, used when the instruction asks about obligations. */
export const OBLIGATION_PATTERN =
  /\b(?:shall|must|is required to|are required to|agrees to|undertakes to|is obliged to|covenants to|no later than|within \d+\s+(?:days|months|years))\b/i;
