import type { ExtractedFact, SourceRef } from '@mdiw/shared';

export function toSourceRef(fact: ExtractedFact, documentName: string): SourceRef {
  return {
    documentId: fact.documentId,
    documentName,
    location: fact.location,
    snippet: fact.snippet,
    factId: fact.id,
  };
}

export function capitalise(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${pluralForm ?? `${singular}s`}`;
}

export function listNames(names: string[], limit = 4): string {
  const shown = names.slice(0, limit);
  const rest = names.length - shown.length;
  const joined =
    shown.length <= 1
      ? (shown[0] ?? '')
      : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  return rest > 0 ? `${joined} (and ${rest} more)` : joined;
}

/** Stable, readable ids so the UI can key findings without a database round trip. */
export function makeId(prefix: string, ...parts: string[]): string {
  const slug = parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${prefix}:${slug || 'item'}`;
}
