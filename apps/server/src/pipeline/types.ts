import type {
  DocumentKind,
  DocumentWarning,
  ExtractedFact,
  SourceLocation,
} from '@mdiw/shared';

/** A line of text with the place it came from. The smallest provenance unit. */
export interface TextLine {
  text: string;
  location: SourceLocation;
}

/** One page of a PDF, or one group of CSV rows. */
export interface RawSegment {
  text: string;
  location: SourceLocation;
  lines: TextLine[];
}

/** Structured view of a CSV, kept alongside the text so headers stay usable. */
export interface CsvTable {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

/** What an extractor returns: text plus everything needed to cite it. */
export interface RawDocument {
  kind: DocumentKind;
  segments: RawSegment[];
  pageCount: number | null;
  rowCount: number | null;
  truncated: boolean;
  warnings: DocumentWarning[];
  table?: CsvTable;
}

export interface Chunk {
  ordinal: number;
  text: string;
  location: SourceLocation;
  charCount: number;
}

/** A fact before it has been persisted; `chunkOrdinal` resolves to a chunk id. */
export type FactCandidate = Omit<ExtractedFact, 'id' | 'documentId'> & {
  chunkOrdinal: number | null;
};

export interface ExtractInput {
  filePath: string;
  originalName: string;
  mime: string;
  kind: DocumentKind;
}

export interface Extractor {
  readonly name: string;
  supports(input: ExtractInput): boolean;
  extract(input: ExtractInput): Promise<RawDocument>;
}
