# FinSight AI

FinSight AI is a financial intelligence workspace for asking questions over structured datasets and financial documents. It combines deterministic Pandas analysis, retrieval-augmented generation (RAG), evidence-based LLM synthesis, document citations, and request telemetry in one full-stack application.

## Capabilities

- Creates a workspace for a financial investigation.
- Accepts CSV, XLSX, PDF, DOCX, and TXT files.
- Profiles structured files for row counts, missing values, duplicates, negative numeric values, and a quality score.
- Extracts, chunks, embeds, and indexes unstructured documents.
- Routes questions to `STRUCTURED`, `RAG`, `HYBRID`, or `REPORT` processing.
- Executes generated Pandas code only against loaded workspace data, with AST validation and restricted built-ins.
- Returns answers together with structured evidence and document evidence.
- Records latency, token usage, estimated cost, route, and heuristic quality metrics.

## Technology stack

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web application | Next.js 15, React 19, TypeScript | Workspace, upload, chat, telemetry, and evaluation views |
| API | FastAPI, Uvicorn, Pydantic | HTTP contracts and request orchestration |
| Relational store | PostgreSQL, Psycopg | Workspace, dataset, document, and audit metadata |
| Object storage | Supabase Storage | Original CSV and XLSX files |
| Vector store | Pinecone | Workspace-scoped document chunks and semantic search |
| Embeddings | Cohere-compatible HTTP API | Document and query vectors |
| Language model | Groq-compatible chat API | Routing, code generation, and answer synthesis |
| Processing | PyMuPDF, python-docx, pandas, openpyxl | Text extraction and tabular loading |

## Local setup

Create `backend/.env` with the required application, database, vector, model, storage, and ingestion settings. The main values are:

```dotenv
APP_NAME=FinSight AI
API_VERSION=1.0.0
API_PREFIX=/api/v1
ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000
STORAGE_DIR=./storage
UPLOAD_DIR=./uploads
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=finsight
DB_POOL_MIN=1
DB_POOL_MAX=5
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key
SUPABASE_STORAGE_BUCKET=financial-files
PINECONE_API_KEY=your-key
PINECONE_INDEX_NAME=your-index
LLM_API_KEY=your-key
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=your-model
LLM_TEMPERATURE=0.0
LLM_MAX_OUTPUT_TOKENS=1000
EMBEDDING_API_KEY=your-key
EMBEDDING_BASE_URL=https://your-embedding-endpoint
EMBEDDING_MODEL=your-model
```

Also provide the remaining required settings from `backend/app/config.py`, including CORS values, default identity values, timeouts, concurrency, retrieval, evaluation, and token-cost settings. Do not commit secrets.

Install and start the backend:

```powershell
cd backend
python -m pip install -r requirements.txt
```

Apply `backend/app/schema.sql` to PostgreSQL, then run:

```powershell
uvicorn app.main:app --reload --port 8000
```

In another terminal, start the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The frontend uses `NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:8000/api/v1`.

## API surface

- `GET /health` checks the API process.
- `POST /api/v1/workspaces` creates a workspace.
- `POST /api/v1/workspaces/{workspace_id}/upload` queues file ingestion.
- `POST /api/v1/workspaces/{workspace_id}/query` runs a financial question.
- `GET /api/v1/workspaces/{workspace_id}/datasets` lists structured-file metadata.
- `GET /api/v1/workspaces/{workspace_id}/documents` lists active document versions.
- `GET /api/v1/workspaces/{workspace_id}/telemetry` lists recent request logs.
- `GET /api/v1/workspaces/{workspace_id}/evaluations` returns aggregate evaluation values.

## Key parameters

| Parameter | Meaning |
| --- | --- |
| `CHUNK_SIZE` | Maximum characters in an extracted document chunk. |
| `CHUNK_OVERLAP` | Characters repeated between adjacent chunks. |
| `RETRIEVAL_TOP_K` | Maximum Pinecone matches returned for a query. |
| `INGESTION_WORKERS` | Maximum concurrent ingestion workers. |
| `INGESTION_BATCH_SIZE` | Pinecone upsert batch size. |
| `QUERY_MAX_RETRIES` | Attempts for invalid generated Pandas code. |
| `LLM_TEMPERATURE` | Model sampling temperature; lower values improve repeatability. |
| `LLM_MAX_OUTPUT_TOKENS` | Maximum generated answer length. |
| `HTTP_TIMEOUT_SECONDS` | Provider request timeout. |
| `INPUT_COST_PER_MILLION_TOKENS` / `OUTPUT_COST_PER_MILLION_TOKENS` | Values used for estimated request cost. |

Retrieval uses the query embedding, the workspace namespace, and a `workspace_id` metadata filter. Evidence includes filename, document ID, chunk ID, page number, version, text, and similarity score.

## Evaluation and metrics

Every query is written to `audit_logs` with route, latency, token counts, estimated cost, status, and JSON metrics. The current lightweight evaluator provides recall, a numeric hallucination flag, a configured routing precision baseline, and a dataset quality score. These are development signals, not a statistically complete evaluation. A production benchmark should add labeled questions, retrieval precision/recall, citation correctness, groundedness, answer relevance, authorization tests, latency percentiles, and cost limits.

## Project structure

```text
backend/app/
  api/             HTTP routes and Pydantic request/response models
  config.py        Environment-backed settings
  db.py            PostgreSQL connection pool and query helpers
  ingestion.py     Parsing, profiling, chunking, embeddings, and indexing
  query.py         Routing, retrieval, evidence assembly, and synthesis
  quality.py       Finance calculations and evaluator helpers
  telemetry.py     Cost calculation, heuristics, and audit logging
  security.py      Workspace and role checks
  retrieval/       Guarded Pandas analysis agent
frontend/app/      Next.js dashboard and visual styles
docs/              Architecture documentation
```

## Verification

From `backend`, run:

```powershell
python -m compileall -q app
pytest -q
```

For the full system design and processing steps, see [docs/architecture.md](docs/architecture.md).
