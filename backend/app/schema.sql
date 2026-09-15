CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO storage.buckets (id, name, public)
VALUES ('financial-files', 'financial-files', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS workspaces (
    workspace_id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(255),
    currency VARCHAR(10),
    reporting_period VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS datasets (
    dataset_id UUID PRIMARY KEY,
    workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(10) NOT NULL DEFAULT 'csv',
    storage_path TEXT NOT NULL,
    row_count INTEGER,
    quality_score NUMERIC(5, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
    document_id UUID PRIMARY KEY,
    workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    chunk_count INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    content_hash VARCHAR(64),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    request_id UUID PRIMARY KEY,
    workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    query TEXT,
    route VARCHAR(50),
    latency NUMERIC(10, 4),
    llm_latency NUMERIC(10, 4),
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_cost NUMERIC(10, 6),
    metrics JSONB,
    status VARCHAR(50),
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metrics JSONB;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS file_type VARCHAR(10) NOT NULL DEFAULT 'csv';
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS storage_path TEXT;

CREATE INDEX IF NOT EXISTS idx_datasets_workspace ON datasets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_datasets_workspace_filename ON datasets(workspace_id, filename);
CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(workspace_id, content_hash, active);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id);

DROP TABLE IF EXISTS financial_records;
DROP TABLE IF EXISTS evaluation_metrics;
