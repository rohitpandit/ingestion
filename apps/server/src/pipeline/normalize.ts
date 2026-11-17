const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const LIGATURES: Array<[RegExp, string]> = [
  [/\u00A0/g, ' '],
  [/[\u2010-\u2015]/g, '-'],
  [/[\u2018\u2019\u201B]/g, "'"],
  [/[\u201C\u201D]/g, '"'],
  [/\u2026/g, '...'],
];

/** Collapses the cosmetic noise PDFs introduce without moving any offsets. */
export function normalizeLine(input: string): string {
  let text = input.normalize('NFKC').replace(CONTROL_CHARS, ' ');
  for (const [pattern, replacement] of LIGATURES) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function normalizeBlock(input: string): string {
  return input
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Lowercased, punctuation-free form used for label lookups and matching. */
export function slugify(input: string): string {
  return normalizeLine(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
