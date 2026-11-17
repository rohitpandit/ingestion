# Multi-Document Intelligence Workbench

Upload several documents, describe the analysis you need in plain English, and get back a structured comparison where every finding points at the document, page or row it came from.

The application reads PDFs and CSVs, extracts values with their locations, analyses each document on its own, and only then compares them. Documents are never merged into one unstructured prompt, so document boundaries and provenance survive the whole run.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind, TanStack Query, React Router |
| Backend | Node, TypeScript, Express, Zod |
| Database | PostgreSQL via Drizzle ORM and drizzle-kit migrations |
| Document processing | `pdfjs-dist` for PDFs, `csv-parse` for CSVs |
| AI | Deterministic rule-based provider behind an `LlmProvider` interface (`LLM_PROVIDER=mock`) |
| Auth | Email and password with bcrypt, server-side sessions in Postgres |

## Getting started

Requires Node 20 or newer, pnpm, and a PostgreSQL database.

```bash
pnpm install
cp .env.example apps/server/.env    # adjust DATABASE_URL and SESSION_SECRET
pnpm db:migrate                     # creates the tables
pnpm samples:generate               # writes synthetic documents to samples/generated
pnpm dev                            # API on :4000, web app on :5173
```

Open http://localhost:5173, create an account, make a workspace, and upload the files from `samples/generated`.

The default `DATABASE_URL` points at `postgres://postgres:postgres@localhost:5433/mydb`. If you need a database, this works:

```bash
docker run -d --name postgres-local-ingestion \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mydb \
  -p 5433:5432 postgres:18
```

There is also an end-to-end check that exercises the whole flow over HTTP against a running server:

```bash
./scripts/smoke.sh
```

It registers a user, uploads the four valid samples plus three deliberately broken ones, waits for ingestion, runs an analysis, and prints the discrepancies, comparison table and missing-information report.

## Layout

```
packages/shared/      Zod schemas and types shared by both sides of the wire
apps/server/
  src/pipeline/       Extraction, normalisation, chunking, fact extraction, classification
  src/analysis/       Instruction parsing, LlmProvider, the rule-based provider, orchestrator
  src/modules/        Workspace, document and analysis HTTP routes
  src/auth/           Session setup and credential routes
  src/jobs/           In-process queue and restart recovery
apps/web/src/         React app: pages, components, results view
samples/generated/    Synthetic documents (created by pnpm samples:generate)
```

## How a document becomes a finding

```mermaid
flowchart TD
  Upload["Upload: extension allowlist, magic bytes, size"] --> Store["Private storage outside any served path"]
  Store --> Extract["Extractor registry: PdfExtractor / CsvExtractor"]
  Extract --> Normalise["Normalise text, keep page and row offsets"]
  Normalise --> Chunk["Chunk within page or row-group boundaries"]
  Chunk --> Facts["Rule-based fact extraction with locations"]
  Facts --> Classify["Classify document type"]
  Classify --> Map["Provider analyses each document alone"]
  Map --> Reduce["Provider aligns facts and synthesises"]
  Reduce --> Validate["Zod validates the structured result"]
  Validate --> Store2[("analyses.result")]
```

### Extraction

Each format has an `Extractor` with `supports()` and `extract()`, registered in `apps/server/src/pipeline/extractors/index.ts`. Adding DOCX or OCR means adding a class there and nothing else.

The PDF extractor reconstructs lines from glyph positions rather than taking pdfjs's raw item order, so `Applicant Name: Rahul K. Mehta` stays on one line and can be read as a label-value pair. Pages that produce no text at all surface as `NO_TEXT_LAYER`, which is how a scanned PDF is reported.

The CSV extractor detects the delimiter, decides whether the first row is a header, and keeps a structured `headers`/`rows` view alongside the text so columns can be mapped to fields.

### Facts and provenance

Every value the pipeline extracts becomes a row in `extracted_facts` carrying:

- `fieldKey`: a canonical key such as `financials.revenue.2025`, so the same concept lines up across documents that word it differently
- `entity`: the party the value describes, which lets a CSV row for "Northwind Traders" align with a PDF about the same company
- `location`: `{kind: 'pdf', page, line}` or `{kind: 'csv', row, column}`
- `snippet`: the surrounding text, shown on hover in the UI
- `method`: `label_match`, `header_match` or `regex`

Nothing downstream invents a citation: a finding can only point at a fact that already exists in that table.

### Analysis

`parseInstruction()` maps the prompt onto intents (compare, inconsistencies, missing information, financial position, and so on) and from those to the sections the result will contain. An unmatched prompt falls back to a summary plus key values rather than returning nothing.

The orchestrator then does a map and a reduce:

1. **Map.** For each document it builds a `DocumentContext` from that document's own facts plus the chunks most relevant to the instruction, capped by a character budget, and calls `analyzeDocument`. No other document is visible during this step.
2. **Reduce.** It calls `synthesize` once with the per-document results. Facts are aligned on `(fieldKey, entity)`, with fuzzy entity matching so "Northwind Traders Pvt Ltd" and "Northwind Traders Private Limited" are treated as one party. Values are compared after normalisation: dates to ISO, amounts to numbers, names and addresses with titles and suffixes stripped.

The provider output is parsed through `analysisResultSchema` before it is persisted, exactly as a hosted model's JSON response would be. A malformed result fails the run rather than reaching the UI.

### Extracted facts versus AI interpretation

Every finding carries a `basis`:

- `extracted` means the value was lifted verbatim and must cite at least one source. The Zod schema enforces this.
- `interpreted` means the engine concluded something, and must carry a `rationale` and a `confidence`. The schema enforces that too.

A discrepancy is a good illustration: the conflicting values are extracted and each cites its own location, while the judgement that they conflict and how serious it is, is interpreted and explains its reasoning ("Amounts were parsed to numbers and differ by 10.4% between the highest and lowest figure"). The UI labels the two differently and never blends them.

### Swapping in a real model

Implement `LlmProvider` from `apps/server/src/analysis/provider.ts`, register it in `provider-factory.ts`, and point `LLM_PROVIDER` at it. The two methods are `analyzeDocument` and `synthesize`; `analysisResultSchema` is the JSON schema a hosted model should be constrained to. Nothing in the orchestrator, the API or the frontend needs to change.

## Handling bad input

Each failure gets a typed code, the document is marked `failed` with a readable message, and the rest of the batch continues.

| Code | Cause |
| --- | --- |
| `UNSUPPORTED_TYPE` | Not a `.pdf` or `.csv` |
| `EXTENSION_MISMATCH` | Contents do not match the extension, for example a text file renamed to `.pdf` |
| `ENCRYPTED_PDF` | Password-protected PDF |
| `CORRUPT_FILE` | Damaged file that pdfjs cannot open |
| `NO_TEXT_LAYER` | A PDF with no selectable text, such as a scan |
| `CSV_MALFORMED` | Unparseable CSV, or binary data in a `.csv` |
| `EMPTY_CONTENT` | Nothing readable in the file |
| `TOO_LARGE` | Over the per-file size ceiling |

Three of the generated samples are deliberately broken so this path can be seen working.

## Limits and large documents

All in `packages/shared/src/limits.ts`:

| Limit | Value |
| --- | --- |
| File size | 10 MB |
| Files per upload | 10 |
| Documents per workspace | 50 |
| PDF pages read | 300 |
| CSV rows read | 50,000 |
| Chunk size | ~2,000 characters |
| Text handed to the provider, per document | 12,000 characters |

Past the page or row limit the document is still processed, `truncated` is set, and both the document card and the analysis warnings say so. The provider never receives whole documents: it gets each document's facts plus the chunks scored most relevant to the instruction, within the per-document budget.

## Security

- Session cookie is `httpOnly`, `sameSite=lax` and `secure` in production; the session id is regenerated on login
- State-changing requests must carry a matching `Origin` or `Referer`, which backs up the `SameSite` cookie against CSRF
- Passwords are bcrypt-hashed at cost 12; login failures are generic and the comparison runs against a dummy hash for unknown accounts so timing does not leak membership
- Uploads are buffered in memory, validated by magic bytes, then written under `uploads/<userId>/<uuid>` outside any served directory; the user's filename is sanitised metadata and never used as a path
- Every query is scoped by `user_id`, so one account cannot read another's documents
- `helmet`, a strict CORS origin, a 128 KB JSON body limit, and rate limits on auth, upload and analysis routes
- Error responses are a fixed `{ error: { code, message, details? } }` envelope; stack traces never leave the process

## Background work

Ingestion and analysis run on an in-process `p-queue` with a concurrency of 2. Job state lives in the database rather than in memory, so the frontend polls for status and a restart can recover: anything left `queued` or `processing` is requeued on boot.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | API and web app together |
| `pnpm build` | Type-check and build all three packages |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm db:generate` | Generate a migration from the Drizzle schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm samples:generate` | Write the synthetic documents |
| `./scripts/smoke.sh` | End-to-end check against a running server |

## Synthetic data

Everything in `samples/generated` is invented. The set is a loan application form, an audited financial statement, a trade licence, and a peer-comparison CSV, all for a fictional company. Conflicts are planted on purpose: the licence number has a transposed digit, revenue for 2025 differs between the application and the statement, the registered address differs by one floor, and a surname is misspelled. Two expected fields are deliberately absent so the missing-information report has something to report.
