# FinSight AI architecture

## System architecture

The platform is split into a Next.js operator console, FastAPI API modules, a PostgreSQL system of record, Pinecone vector retrieval, and external embedding/LLM providers. API request flow is authentication, workspace authorization, query classification, deterministic SQL and/or authorized retrieval, evidence collection, guarded synthesis, citations, audit logging, and response.

## Ingestion architecture

Uploads are type detected for PDF, DOCX, XLSX, CSV, and TXT. Format parsers normalize content, structured data is profiled for schema, missing values, duplicates, invalid values, and currency consistency, and document metadata is extracted before chunking. Embeddings are generated with bounded workers and rate-limited provider adapters, then upserted to Pinecone in batches. Each vector metadata record includes workspace_id, document_id, file_name, file_type, fiscal_year, reporting_period, document_type, access_level, page_number, chunk_id, version, and upload timestamp. PostgreSQL stores document status, content hashes, lineage, active/archived versions, errors, profiles, and dataset relationships.

## Hybrid SQL/RAG architecture

A deterministic router selects SQL, RAG, hybrid, or report. SQL routes use PostgreSQL for calculations; the model does not calculate values that are available in structured data. RAG routes apply workspace and document authorization filters before top-k retrieval and optional reranking. Hybrid routes combine SQL facts and cited excerpts. Missing or low-scoring evidence produces an explicit insufficient-evidence response.

## Security model

Identity is attached to every request. Workspace membership and roles are checked before database access and are repeated as Pinecone metadata filters. Document-level access_level is enforced in the retrieval adapter. Prompt injection, malformed SQL, unsupported claims, excessive cost/context, and sensitive output are guardrail checkpoints. Audit records include request, identity, route, sources, and outcome.

## Data lineage

A file content hash maps an upload to its document version. A document maps to normalized chunks and Pinecone vector IDs. A structured document maps to a dataset profile and PostgreSQL tables. Queries reference document, page, chunk, model, and evaluation records, enabling source-to-answer traceability.

## Evaluation strategy

The benchmark dataset stores questions, expected route, relevant chunk IDs, expected facts, and citation targets. Offline evaluation measures retrieval precision, recall, MRR, context relevance, answer relevance, faithfulness, citation correctness, hallucination rate, latency, token usage, and cost per query. Release gates require thresholds for groundedness, citation correctness, authorization tests, and cost.

## Observability

Each request emits request ID, workspace ID, user ID, query, route, retrieved chunk IDs, models, token usage, stage latency, Pinecone and PostgreSQL latency, estimated cost, scores, errors, and final evaluation score. Metrics feed the quality, data health, and platform performance dashboards.

## Scalability and cost control

Independent files use a bounded ThreadPoolExecutor. Provider calls use bounded batches, backoff, and rate limits. Ingestion is resumable by document version and content hash. PostgreSQL indexes scope queries by workspace and active status. Pinecone namespaces isolate workspaces. Context budgets, top-k limits, model routing, and cost ceilings prevent runaway queries.

## Architecture decisions

PostgreSQL remains authoritative for structured financial data, identity, lineage, and audit. Pinecone is optimized for semantic retrieval, never authorization. FastAPI keeps API boundaries explicit. Function-based modules make ingestion, routing, retrieval, and evaluation independently testable.

## Failure handling

Unsupported files are rejected before indexing. Partial ingestion records status and an error for retry. Provider timeouts use retry policy and preserve the prior active document version. Low evidence is surfaced rather than filled with model speculation. Audit logging is best effort with an operational alert on failure.

## Deployment architecture

Local development runs the FastAPI backend and Next.js frontend directly. Azure deployment can map the API to Container Apps, PostgreSQL to Azure Database for PostgreSQL, secrets to Key Vault, observability to Application Insights, and the frontend to Azure Static Web Apps. Pinecone remains a managed external vector service.
