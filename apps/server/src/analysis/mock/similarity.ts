/** Dice coefficient over character bigrams: 1 is identical, 0 is unrelated. */
export function similarity(a: string, b: string): number {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < left.length - 1; i += 1) {
    const gram = left.slice(i, i + 2);
    bigrams.set(gram, (bigrams.get(gram) ?? 0) + 1);
  }

  let hits = 0;
  for (let i = 0; i < right.length - 1; i += 1) {
    const gram = right.slice(i, i + 2);
    const count = bigrams.get(gram) ?? 0;
    if (count > 0) {
      bigrams.set(gram, count - 1);
      hits += 1;
    }
  }

  return (2 * hits) / (left.length - 1 + right.length - 1);
}

/** Token overlap, which suits multi-word entity names better than bigrams. */
export function tokenOverlap(a: string, b: string): number {
  const left = new Set(a.split(/\s+/).filter(Boolean));
  const right = new Set(b.split(/\s+/).filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  return shared / Math.min(left.size, right.size);
}

/**
 * Collapses entity spellings onto one canonical form so "Northwind Traders"
 * and "Northwind Traders Pvt" are treated as the same party.
 */
export function canonicalizeEntities(entities: string[]): Map<string, string> {
  const unique = Array.from(new Set(entities.filter((entity) => entity.length > 0)));
  // Longest first: the fuller spelling becomes the canonical form.
  unique.sort((a, b) => b.length - a.length);

  const canonical: string[] = [];
  const mapping = new Map<string, string>();

  for (const entity of unique) {
    const match = canonical.find(
      (candidate) => tokenOverlap(candidate, entity) >= 0.7 || similarity(candidate, entity) >= 0.85,
    );
    if (match) {
      mapping.set(entity, match);
    } else {
      canonical.push(entity);
      mapping.set(entity, entity);
    }
  }

  return mapping;
}
