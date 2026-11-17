import type { DocumentKind } from '@mdiw/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { documentChunks, documents, extractedFacts } from '../db/schema.js';
import { chunkDocument } from './chunker.js';
import { classifyDocument } from './classify.js';
import { extractFacts } from './facts/index.js';
import { resolveExtractor } from './extractors/index.js';
import { toPipelineError } from './pipeline-error.js';
import type { ExtractInput } from './types.js';

const PREVIEW_CHARS = 1_200;

/**
 * Runs one document through extract -> normalise -> chunk -> facts -> classify
 * and persists the result. Failures are recorded on the row so one bad file
 * never stops the rest of a batch.
 */
export async function processDocument(documentId: string): Promise<void> {
  const [row] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!row) return;

  await db
    .update(documents)
    .set({ status: 'processing', errorCode: null, errorMessage: null })
    .where(eq(documents.id, documentId));

  const input: ExtractInput = {
    filePath: row.storageKey,
    originalName: row.originalName,
    mime: row.mime,
    kind: row.kind as DocumentKind,
  };

  try {
    const extractor = resolveExtractor(input);
    const raw = await extractor.extract(input);
    const chunks = chunkDocument(raw);
    const { facts, primaryEntity } = extractFacts(raw, chunks);
    const detectedType = classifyDocument(raw, facts);

    const fullText = raw.segments.map((segment) => segment.text).join('\n');
    const preview = fullText.slice(0, PREVIEW_CHARS);

    await db.transaction(async (tx) => {
      await tx.delete(extractedFacts).where(eq(extractedFacts.documentId, documentId));
      await tx.delete(documentChunks).where(eq(documentChunks.documentId, documentId));

      const insertedChunks = chunks.length
        ? await tx
            .insert(documentChunks)
            .values(
              chunks.map((chunk) => ({
                documentId,
                ordinal: chunk.ordinal,
                text: chunk.text,
                location: chunk.location,
                charCount: chunk.charCount,
              })),
            )
            .returning({ id: documentChunks.id, ordinal: documentChunks.ordinal })
        : [];

      const chunkIdByOrdinal = new Map(insertedChunks.map((chunk) => [chunk.ordinal, chunk.id]));

      if (facts.length > 0) {
        await tx.insert(extractedFacts).values(
          facts.map((fact) => ({
            documentId,
            chunkId: fact.chunkOrdinal === null ? null : (chunkIdByOrdinal.get(fact.chunkOrdinal) ?? null),
            category: fact.category,
            fieldKey: fact.fieldKey,
            fieldLabel: fact.fieldLabel,
            entity: fact.entity,
            rawValue: fact.rawValue,
            normalizedValue: fact.normalizedValue,
            location: fact.location,
            snippet: fact.snippet,
            method: fact.method,
          })),
        );
      }

      await tx
        .update(documents)
        .set({
          status: 'ready',
          detectedType,
          primaryEntity,
          pageCount: raw.pageCount,
          rowCount: raw.rowCount,
          charCount: fullText.length,
          truncated: raw.truncated,
          warnings: raw.warnings,
          preview,
          errorCode: null,
          errorMessage: null,
          processedAt: new Date(),
        })
        .where(eq(documents.id, documentId));
    });
  } catch (error) {
    const pipelineError = toPipelineError(error);
    await db
      .update(documents)
      .set({
        status: 'failed',
        errorCode: pipelineError.code,
        errorMessage: pipelineError.message,
        processedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
  }
}
