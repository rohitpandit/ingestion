import { eq, inArray } from 'drizzle-orm';
import PQueue from 'p-queue';
import { db } from '../db/client.js';
import { analyses, documents } from '../db/schema.js';
import { runAnalysis } from '../analysis/orchestrator.js';
import { processDocument } from '../pipeline/run.js';

/**
 * A single in-process worker pool. Job state lives in Postgres rather than in
 * memory, so the frontend polls the database and a restart can recover.
 */
const queue = new PQueue({ concurrency: 2 });

function enqueue(label: string, task: () => Promise<void>): void {
  void queue.add(async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[jobs] ${label} failed`, error);
    }
  });
}

export function enqueueDocument(documentId: string): void {
  enqueue(`ingest ${documentId}`, () => processDocument(documentId));
}

export function enqueueAnalysis(analysisId: string): void {
  enqueue(`analysis ${analysisId}`, () => runAnalysis(analysisId));
}

/**
 * A crash can leave rows stuck mid-flight. On boot, anything still `queued` or
 * `processing` is put back on the queue.
 */
export async function recoverPendingJobs(): Promise<void> {
  const stuckDocuments = await db
    .select({ id: documents.id })
    .from(documents)
    .where(inArray(documents.status, ['queued', 'processing']));

  for (const row of stuckDocuments) {
    await db.update(documents).set({ status: 'queued' }).where(eq(documents.id, row.id));
    enqueueDocument(row.id);
  }

  const stuckAnalyses = await db
    .select({ id: analyses.id })
    .from(analyses)
    .where(inArray(analyses.status, ['queued', 'processing']));

  for (const row of stuckAnalyses) {
    await db.update(analyses).set({ status: 'queued' }).where(eq(analyses.id, row.id));
    enqueueAnalysis(row.id);
  }

  const total = stuckDocuments.length + stuckAnalyses.length;
  if (total > 0) {
    console.log(`[jobs] requeued ${total} unfinished job(s) after restart`);
  }
}

export async function drainQueue(): Promise<void> {
  await queue.onIdle();
}
