import { countDistinct, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { documents, extractedFacts, type DocumentRow } from '../../db/schema.js';

export interface DocumentWithFactCount {
  document: DocumentRow;
  factCount: number;
}

/** Documents in a workspace, newest first, with how many facts each yielded. */
export async function listWorkspaceDocuments(workspaceId: string): Promise<DocumentWithFactCount[]> {
  const rows = await db
    .select({ document: documents, factCount: countDistinct(extractedFacts.id) })
    .from(documents)
    .leftJoin(extractedFacts, eq(extractedFacts.documentId, documents.id))
    .where(eq(documents.workspaceId, workspaceId))
    .groupBy(documents.id)
    .orderBy(desc(documents.createdAt));

  return rows.map((row) => ({ document: row.document, factCount: Number(row.factCount) }));
}
