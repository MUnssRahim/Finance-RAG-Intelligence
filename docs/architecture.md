# FinSight AI architecture

## 1. Purpose and boundaries

FinSight AI is a workspace-scoped application for financial investigation. It accepts tabular data and text documents, prepares them for analysis, answers natural-language questions, and returns the evidence used to form each answer.

The system has five boundaries:

1. **Next.js frontend:** workspace creation, file upload, chat, evidence, telemetry, and evaluation views.
2. **FastAPI backend:** API contracts and ingestion/query orchestration.
3. **PostgreSQL:** workspace metadata, dataset metadata, document versions, and audit logs.
4. **Storage and retrieval services:** Supabase Storage for structured source files and Pinecone for document chunks.
5. **Model providers:** an embedding endpoint and a Groq-compatible chat endpoint.

Pinecone is a search index, not the system of record. PostgreSQL metadata and stored source files remain authoritative.

## 2. High-level flow

```text
Browser -> Next.js dashboard -> FastAPI route
			 -> workspace context -> structured analysis and/or retrieval
			 -> evidence assembly -> constrained LLM synthesis
			 -> telemetry -> response
```

Application routes are normally mounted below `/api/v1`. The process health endpoint is `/health`.

## 3. Workspace and identity

A workspace is the primary isolation boundary. Dataset rows, document rows, vector namespaces, and audit records carry a `workspace_id`.

The current development identity is read from `x-user-id`, `x-workspace-id`, and `x-role` request headers. Missing values fall back to configured defaults. Workspace mismatch returns `403`, and the current document check permits `Owner`, `Analyst`, and `Viewer` roles within the same workspace.

This is appropriate for controlled development but is not a complete authentication system. Production should replace header defaults with verified identity-provider tokens, server-side membership checks, database row-level security, and explicit authorization at every data access boundary.

## 4. Ingestion pipeline

### Step 1: Upload

`POST /workspaces/{workspace_id}/upload` accepts multiple files. CSV and XLSX files are written to Supabase Storage. PDF, DOCX, and TXT files are written to the configured upload directory. The API returns `ingestion_queued` and schedules background work.

### Step 2: Type-specific processing

| File type | Processing | Durable result |
| --- | --- | --- |
| CSV/XLSX | Load with pandas and profile quality | `datasets` row and source object |
| PDF | Extract text page by page with PyMuPDF | Chunk vectors and `documents` row |
| DOCX | Extract paragraphs with `python-docx` | Chunk vectors and `documents` row |
| TXT | Read UTF-8 text with replacement for invalid bytes | Chunk vectors and `documents` row |

### Step 3: Structured profiling

The profiler records row count, column count, missing values, duplicate records, negative numeric values, columns, and `overall_quality_score`:

$$
Q = \max\left(0, \min\left(100, 100 - 100 \times \frac{M + D + N}{C}\right)\right)
$$

Here $M$ is the missing-cell count, $D$ is duplicate-record count, $N$ is negative numeric-value count, and $C$ is total cell count. This is a screening metric, not an accounting judgment.

### Step 4: Chunking and indexing

Extracted text is divided into character-based chunks using `CHUNK_SIZE` and `CHUNK_OVERLAP`. Each chunk receives an ID based on document ID, page number, and chunk index. Embeddings are upserted to a Pinecone namespace equal to the workspace ID.

Vector metadata contains document ID, workspace ID, filename, file type, page number, chunk ID, version, access level, text, and upload timestamp.

### Step 5: Versioning

Unstructured files receive a SHA-256 content hash. An active document with the same workspace and hash is skipped. A changed file increments the filename version, old vectors are deleted, old rows become inactive, and the new version becomes active.

## 5. Query orchestration

`process_user_query` executes these stages:

1. **Routing:** structured-only workspaces use `STRUCTURED`; document-only workspaces use `RAG`; mixed workspaces use the model to select `STRUCTURED`, `RAG`, `HYBRID`, or `REPORT`.
2. **Structured execution:** structured, hybrid, and report routes call the Pandas agent, which loads workspace CSV/XLSX files and generates code assigning its final value to `result`.
3. **Document retrieval:** RAG, hybrid, and report routes embed the question and query Pinecone with the workspace namespace and `workspace_id` filter.
4. **Evidence assembly:** computed data and retrieved excerpts are placed into one prompt.
5. **Synthesis:** the model is instructed to use only supplied evidence, state when evidence is insufficient, and cite document filenames.
6. **Telemetry:** tokens, estimated cost, latency, route, status, and heuristic metrics are stored in `audit_logs`.

The structured path is a guarded Pandas execution path, not SQL generation. The model does not receive authority to query arbitrary files or databases.

## 6. Pandas execution controls

Generated code is parsed with Python AST validation before execution. Imports are rejected. Names and attributes associated with filesystem and process access, including `open`, `os`, `sys`, `subprocess`, `eval`, and `exec`, are rejected. The execution environment receives only `dfs`, pandas, NumPy, and a small allow-list of built-ins.

Results are converted to JSON-compatible values. Invalid code is retried up to `QUERY_MAX_RETRIES` times with the execution error as feedback. This reduces accidental unsafe operations, but production should isolate generated-code execution in a separately constrained worker.

## 7. Retrieval parameters

| Parameter | Engineering effect |
| --- | --- |
| `CHUNK_SIZE` | Larger chunks preserve context but can reduce retrieval precision. |
| `CHUNK_OVERLAP` | More overlap preserves boundaries but increases index size. |
| `RETRIEVAL_TOP_K` | Higher values improve recall at the cost of prompt size and latency. |
| `INGESTION_BATCH_SIZE` | Controls vector upsert batch size. |
| `INGESTION_WORKERS` | Controls concurrent ingestion and provider pressure. |
| `HTTP_TIMEOUT_SECONDS` | Bounds external storage, embedding, and model waits. |

Retrieval is currently similarity-based without a reranker or explicit score threshold. Tuning should measure recall and citation correctness while varying chunk size, overlap, top-k, and a minimum similarity threshold.

## 8. Data model and lineage

```text
workspace
	-> dataset -> stored CSV/XLSX object
	-> document version -> pages -> chunks -> Pinecone vectors
	-> audit log -> route, latency, tokens, cost, and metrics
```

Key lineage fields are dataset storage path and quality score; document filename, version, hash, active flag, and chunk count; vector document/chunk/page/version metadata; and audit request ID, route, status, cost, and metrics. This allows an answer to be traced to a structured computation or to a document filename, page, chunk, and version.

## 9. Security and governance

Current controls include workspace matching, role checks, workspace-scoped Pinecone namespaces, metadata filters, restricted Pandas code, evidence-only synthesis instructions, and audit logging.

Production controls should add verified authentication, upload size/type limits, malware scanning, encrypted secret management, document-level authorization in every retrieval request, prompt-injection testing, and isolated generated-code execution.

The model is not an authorization mechanism. Authorization must occur before data enters a model prompt.

## 10. Evaluation strategy

The current online evaluator provides:

- **Numeric hallucination flag:** large answer numbers absent from structured evidence.
- **Document recall heuristic:** the fraction of answer words longer than five characters found in retrieved text.
- **Routing precision baseline:** a configured value exposed by the evaluations endpoint.
- **Optional relevance and groundedness helpers:** LLM-based functions in `quality.py`.

These are development diagnostics. A proper benchmark should label question, expected route, expected facts, relevant chunks, and citation targets, then measure retrieval precision/recall/MRR, answer relevance, groundedness, citation correctness, numerical correctness, hallucination rate, authorization leakage, p50/p95 latency, token usage, and cost.

Release gates should require zero authorization leakage, acceptable numerical correctness, groundedness, citation correctness, and a cost ceiling.

## 11. Observability and cost

Application logs include workspace, filename, route, provider, match counts, stage timing, and errors. Request telemetry stores the audit record. Estimated cost is calculated as:

$$
	ext{cost} = \frac{T_{in}}{10^6}P_{in} + \frac{T_{out}}{10^6}P_{out}
$$

where $T$ is token count and $P$ is configured price per million tokens. This estimate must be updated when provider pricing or models change.

## 12. Reliability and failure handling

- Unsupported file types fail before processing.
- Duplicate document content is skipped by content hash.
- Failed background ingestion is logged and returned as an error result.
- Provider and database failures follow the API error path.
- Failed generated Pandas code is retried with feedback.
- Missing evidence should produce an insufficient-evidence answer.
- Audit logging is best effort; production should alert when telemetry writes fail.

The upload endpoint reports that work is queued, not that ingestion is complete. The frontend polls dataset and document endpoints to observe completion.

## 13. Deployment shape

Local development runs FastAPI and Next.js as separate processes. A managed deployment can use a containerized API, managed PostgreSQL, Supabase Storage, Pinecone, a secret manager, and a hosted Next.js frontend. Before serving sensitive financial data, add TLS, migrations, health/readiness checks, durable background jobs, centralized logs, provider egress controls, and rate limiting.

## 14. Design decisions

- PostgreSQL is authoritative for workspace state, metadata, and audit records.
- Object storage keeps binary source files outside the relational database.
- Pinecone provides semantic search but never replaces authorization.
- Pandas supports flexible financial questions without asking the model to perform arithmetic unaudited.
- Evidence-first synthesis keeps answers tied to computed results and retrieved excerpts.
- Function-oriented modules keep ingestion, routing, retrieval, security, and telemetry independently testable.
