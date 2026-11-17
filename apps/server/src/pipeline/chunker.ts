import { LIMITS, type SourceLocation } from '@mdiw/shared';

import type { Chunk, RawDocument } from './types.js';

/** Splits an over-long page on line boundaries so no chunk straddles a page. */
function splitByLines(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const parts: string[] = [];
  let current = '';

  for (const line of text.split('\n')) {
    if (current.length > 0 && current.length + line.length + 1 > maxChars) {
      parts.push(current);
      current = '';
    }
    // A single line longer than the budget is hard-split rather than dropped.
    if (line.length > maxChars) {
      for (let offset = 0; offset < line.length; offset += maxChars) {
        parts.push(line.slice(offset, offset + maxChars));
      }
      continue;
    }
    current = current.length > 0 ? `${current}\n${line}` : line;
  }

  if (current.length > 0) parts.push(current);
  return parts;
}

/**
 * Chunks never cross a page (PDF) or a row group (CSV), so every chunk keeps a
 * location precise enough to cite.
 */
export function chunkDocument(raw: RawDocument): Chunk[] {
  const chunks: Chunk[] = [];

  for (const segment of raw.segments) {
    const pieces =
      raw.kind === 'csv' ? [segment.text] : splitByLines(segment.text, LIMITS.chunkChars);

    for (const text of pieces) {
      if (text.trim().length === 0) continue;
      chunks.push({
        ordinal: chunks.length,
        text,
        location: segment.location,
        charCount: text.length,
      });
    }
  }

  return chunks;
}

/** Maps a line's location onto the chunk that contains it. */
export function findChunkOrdinal(chunks: Chunk[], location: SourceLocation): number | null {
  for (const chunk of chunks) {
    if (chunk.location.kind !== location.kind) continue;
    if (chunk.location.kind === 'pdf' && location.kind === 'pdf') {
      if (chunk.location.page === location.page) return chunk.ordinal;
    }
    if (chunk.location.kind === 'csv' && location.kind === 'csv') {
      const start = chunk.location.row;
      const end = chunk.location.rowEnd ?? chunk.location.row;
      if (location.row >= start && location.row <= end) return chunk.ordinal;
    }
  }
  return null;
}
