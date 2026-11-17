import {
  LIMITS,
  analysisResultSchema,
  type AnalysisResult,
  type AnalysisSection,
  type AnalysisWarning,
  type DetectedType,
  type ExtractedFact,
  type SourceLocation,
} from '@mdiw/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { analyses, documentChunks, documents, extractedFacts } from '../db/schema.js';
import { parseInstruction, type ParsedInstruction } from './instruction.js';
import { createProvider } from './provider-factory.js';
import type { DocumentAnalysis, DocumentContext } from './provider.js';

/** Picks the chunks most likely to answer the instruction, within budget. */
function selectExcerpts(
  chunks: Array<{ text: string; location: SourceLocation; ordinal: number }>,
  instruction: ParsedInstruction,
): Array<{ text: string; location: SourceLocation }> {
  const scored = chunks.map((chunk) => {
    const haystack = chunk.text.toLowerCase();
    let score = 0;
    for (const keyword of instruction.keywords) {
      if (haystack.includes(keyword)) score += 2;
    }
    // Early chunks carry headers and identifying details.
    score += Math.max(0, 3 - chunk.ordinal);
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score || a.chunk.ordinal - b.chunk.ordinal);

  const selected: Array<{ text: string; location: SourceLocation; ordinal: number }> = [];
  let budget = LIMITS.providerCharBudget;

  for (const { chunk } of scored) {
    if (budget <= 0) break;
    const text = chunk.text.length > budget ? chunk.text.slice(0, budget) : chunk.text;
    budget -= text.length;
    selected.push({ text, location: chunk.location, ordinal: chunk.ordinal });
  }

  // Restore reading order so excerpts are coherent.
  return selected
    .sort((a, b) => a.ordinal - b.ordinal)
    .map(({ text, location }) => ({ text, location }));
}

function toFact(row: typeof extractedFacts.$inferSelect): ExtractedFact {
  return {
    id: row.id,
    documentId: row.documentId,
    category: row.category as ExtractedFact['category'],
    fieldKey: row.fieldKey,
    fieldLabel: row.fieldLabel,
    entity: row.entity,
    rawValue: row.rawValue,
    normalizedValue: row.normalizedValue,
    location: row.location,
    snippet: row.snippet,
    method: row.method as ExtractedFact['method'],
  };
}

async function buildContext(
  document: typeof documents.$inferSelect,
  instruction: ParsedInstruction,
): Promise<DocumentContext> {
  const [facts, chunks] = await Promise.all([
    db.select().from(extractedFacts).where(eq(extractedFacts.documentId, document.id)),
    db
      .select({
        text: documentChunks.text,
        location: documentChunks.location,
        ordinal: documentChunks.ordinal,
      })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, document.id))
      .orderBy(asc(documentChunks.ordinal)),
  ]);

  return {
    documentId: document.id,
    documentName: document.originalName,
    detectedType: document.detectedType as DetectedType,
    primaryEntity: document.primaryEntity,
    pageCount: document.pageCount,
    rowCount: document.rowCount,
    chunkCount: chunks.length,
    truncated: document.truncated,
    facts: facts.map(toFact),
    excerpts: selectExcerpts(chunks, instruction),
  };
}

export class AnalysisInputError extends Error {}

const SECTION_ORDER: AnalysisSection[] = [
  'summary',
  'comparisonTable',
  'discrepancies',
  'missingInformation',
  'keyValues',
  'perDocument',
];

/**
 * The instruction decides which sections to lead with, but a section that has
 * real findings is never hidden just because the prompt did not name it.
 */
function withFindingSections(
  requested: AnalysisSection[],
  populated: Partial<Record<AnalysisSection, boolean>>,
): AnalysisSection[] {
  const sections = new Set(requested);
  for (const [section, hasContent] of Object.entries(populated)) {
    if (hasContent) sections.add(section as AnalysisSection);
  }
  return SECTION_ORDER.filter((section) => sections.has(section));
}

/**
 * Map then reduce: every document is analysed in isolation and only the
 * resulting structured findings are combined. No document text is ever merged
 * into a single blob, so each finding keeps a traceable source.
 */
export async function runAnalysis(analysisId: string): Promise<void> {
  const [record] = await db.select().from(analyses).where(eq(analyses.id, analysisId)).limit(1);
  if (!record) return;

  await db.update(analyses).set({ status: 'processing' }).where(eq(analyses.id, analysisId));

  try {
    const instruction = parseInstruction(record.prompt);
    const provider = createProvider();

    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.workspaceId, record.workspaceId), inArray(documents.id, record.documentIds)));

    const warnings: AnalysisWarning[] = [];
    const ready = rows.filter((row) => row.status === 'ready');

    for (const row of rows) {
      if (row.status === 'ready') continue;
      warnings.push({
        code: 'DOCUMENT_EXCLUDED',
        message:
          row.status === 'failed'
            ? `${row.originalName} was excluded because it could not be read (${row.errorMessage ?? 'unknown error'}).`
            : `${row.originalName} was excluded because it is still being processed.`,
        documentId: row.id,
      });
    }

    if (ready.length === 0) {
      throw new AnalysisInputError('None of the selected documents could be read.');
    }

    // Map: one pass per document, in isolation.
    const documentAnalyses: DocumentAnalysis[] = [];
    for (const row of ready) {
      const context = await buildContext(row, instruction);
      documentAnalyses.push(await provider.analyzeDocument(context, instruction));
    }

    // Reduce: combine the structured findings, not the text.
    const cross = await provider.synthesize(documentAnalyses, instruction);

    const missingInformation = documentAnalyses
      .map((analysis) => analysis.missing)
      .filter((report) => report.missing.length > 0);

    const candidate: AnalysisResult = {
      schemaVersion: 1,
      prompt: record.prompt,
      intents: instruction.intents,
      sections: withFindingSections(instruction.sections, {
        discrepancies: cross.discrepancies.length > 0,
        missingInformation: missingInformation.length > 0,
      }),
      providerName: provider.name,
      generatedAt: new Date().toISOString(),
      documents: documentAnalyses.map((analysis) => ({
        documentId: analysis.context.documentId,
        documentName: analysis.context.documentName,
        detectedType: analysis.context.detectedType,
      })),
      summary: { headline: cross.headline, statements: cross.statements },
      comparisonTable: cross.comparisonTable,
      discrepancies: cross.discrepancies,
      missingInformation,
      keyValues: documentAnalyses.map((analysis) => analysis.keyValues),
      perDocument: documentAnalyses.map((analysis) => analysis.perDocument),
      warnings: [...warnings, ...cross.warnings],
    };

    // Provider output is validated before it is stored, exactly as a real
    // model's JSON response would be.
    const result = analysisResultSchema.parse(candidate);

    await db
      .update(analyses)
      .set({ status: 'completed', result, error: null, completedAt: new Date() })
      .where(eq(analyses.id, analysisId));
  } catch (error) {
    const message =
      error instanceof AnalysisInputError
        ? error.message
        : 'The analysis could not be completed. Please try again.';
    if (!(error instanceof AnalysisInputError)) {
      console.error('[analysis] run failed', error);
    }
    await db
      .update(analyses)
      .set({ status: 'failed', error: message, completedAt: new Date() })
      .where(eq(analyses.id, analysisId));
  }
}
