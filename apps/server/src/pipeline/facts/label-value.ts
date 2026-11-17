import { slugify } from '../normalize.js';
import { resolveField } from './field-map.js';

export interface LabelValuePair {
  label: string;
  value: string;
}

const MAX_LABEL_WORDS = 6;
const MAX_VALUE_CHARS = 300;
const SEPARATOR = /[:\u2013\u2014]|\s-\s/;

function isKnownLabel(candidate: string): boolean {
  return !resolveField(candidate).fieldKey.startsWith('other.');
}

/**
 * Trims a run of text back to the part that actually reads as a label. PDF
 * text extraction often glues a previous value onto the next label
 * ("John Doe Date of Birth"), so prefer the longest suffix the field map
 * recognises and fall back to the last few words.
 */
function pickLabel(text: string, isFirstOnLine: boolean): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  for (let take = Math.min(MAX_LABEL_WORDS, words.length); take >= 1; take -= 1) {
    const candidate = words.slice(words.length - take).join(' ');
    if (isKnownLabel(candidate)) return candidate;
  }

  if (isFirstOnLine && words.length <= MAX_LABEL_WORDS) return words.join(' ');
  if (words.length <= 3) return words.join(' ');
  return words.slice(words.length - 3).join(' ');
}

/**
 * Splits a single line into every `label: value` pair it contains, which is
 * common in form-style PDFs where several fields share a row.
 */
export function splitLabelValuePairs(line: string): LabelValuePair[] {
  const separators: Array<{ index: number; length: number }> = [];
  const matcher = new RegExp(SEPARATOR, 'g');
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(line)) !== null) {
    separators.push({ index: match.index, length: match[0].length });
    if (separators.length > 12) break;
  }

  if (separators.length === 0) return [];

  // Text between separators holds the tail of one value and the head of the
  // next label, so resolve every label first and then carve out the values.
  const between: string[] = [];
  let cursor = 0;
  for (const separator of separators) {
    between.push(line.slice(cursor, separator.index));
    cursor = separator.index + separator.length;
  }
  const tail = line.slice(cursor);

  const labels = between.map((source, index) => pickLabel(source, index === 0));

  const pairs: LabelValuePair[] = [];
  separators.forEach((_, index) => {
    const label = labels[index];
    if (!label) return;

    const nextSource = between[index + 1];
    let value: string;
    if (nextSource === undefined) {
      value = tail;
    } else {
      const nextLabel = labels[index + 1];
      value =
        nextLabel && nextSource.trimEnd().toLowerCase().endsWith(nextLabel.toLowerCase())
          ? nextSource.trimEnd().slice(0, nextSource.trimEnd().length - nextLabel.length)
          : nextSource;
    }

    value = value.trim().replace(/[;,]$/, '').trim();
    if (value.length === 0 || value.length > MAX_VALUE_CHARS) return;
    if (slugify(label).length === 0) return;
    pairs.push({ label: label.trim(), value });
  });

  return pairs;
}
