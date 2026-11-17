import type {
  AnalysisResult,
  DocumentWarning,
  SourceLocation,
} from '@mdiw/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 254 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
  }),
);

/**
 * Table layout required by connect-pg-simple. It is declared here so the
 * migration pipeline owns it rather than relying on createTableIfMissing.
 */
export const sessions = pgTable(
  'session',
  {
    sid: varchar('sid').primaryKey(),
    sess: jsonb('sess').notNull(),
    expire: timestamp('expire', { precision: 6, withTimezone: false }).notNull(),
  },
  (t) => ({
    expireIdx: index('IDX_session_expire').on(t.expire),
  }),
);

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('workspaces_user_idx').on(t.userId, t.createdAt),
  }),
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originalName: varchar('original_name', { length: 400 }).notNull(),
    storageKey: text('storage_key').notNull(),
    kind: varchar('kind', { length: 16 }).notNull(),
    mime: varchar('mime', { length: 128 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    detectedType: varchar('detected_type', { length: 40 }).notNull().default('unknown'),
    primaryEntity: varchar('primary_entity', { length: 200 }),
    status: varchar('status', { length: 16 }).notNull().default('queued'),
    errorCode: varchar('error_code', { length: 40 }),
    errorMessage: text('error_message'),
    pageCount: integer('page_count'),
    rowCount: integer('row_count'),
    charCount: integer('char_count'),
    truncated: boolean('truncated').notNull().default(false),
    warnings: jsonb('warnings').$type<DocumentWarning[]>().notNull().default(sql`'[]'::jsonb`),
    preview: text('preview').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => ({
    workspaceIdx: index('documents_workspace_idx').on(t.workspaceId, t.createdAt),
    userIdx: index('documents_user_idx').on(t.userId),
    statusIdx: index('documents_status_idx').on(t.status),
  }),
);

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    location: jsonb('location').$type<SourceLocation>().notNull(),
    charCount: integer('char_count').notNull(),
  },
  (t) => ({
    documentIdx: index('document_chunks_document_idx').on(t.documentId, t.ordinal),
  }),
);

export const extractedFacts = pgTable(
  'extracted_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    chunkId: uuid('chunk_id').references(() => documentChunks.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 40 }).notNull(),
    fieldKey: varchar('field_key', { length: 120 }).notNull(),
    fieldLabel: varchar('field_label', { length: 200 }),
    entity: varchar('entity', { length: 200 }),
    rawValue: text('raw_value').notNull(),
    normalizedValue: text('normalized_value'),
    location: jsonb('location').$type<SourceLocation>().notNull(),
    snippet: text('snippet').notNull(),
    method: varchar('method', { length: 24 }).notNull(),
  },
  (t) => ({
    documentIdx: index('extracted_facts_document_idx').on(t.documentId),
    fieldIdx: index('extracted_facts_field_idx').on(t.fieldKey),
  }),
);

export const analyses = pgTable(
  'analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    prompt: text('prompt').notNull(),
    documentIds: jsonb('document_ids').$type<string[]>().notNull(),
    status: varchar('status', { length: 16 }).notNull().default('queued'),
    result: jsonb('result').$type<AnalysisResult>(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    workspaceIdx: index('analyses_workspace_idx').on(t.workspaceId, t.createdAt),
    statusIdx: index('analyses_status_idx').on(t.status),
  }),
);

export type DocumentRow = typeof documents.$inferSelect;
export type ChunkRow = typeof documentChunks.$inferSelect;
export type FactRow = typeof extractedFacts.$inferSelect;
export type AnalysisRow = typeof analyses.$inferSelect;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type UserRow = typeof users.$inferSelect;
