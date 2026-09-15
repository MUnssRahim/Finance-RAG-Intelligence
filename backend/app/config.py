from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str
    api_version: str
    api_prefix: str
    environment: str
    frontend_url: str
    storage_dir: str
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "financial-files"
    cors_allow_credentials: bool
    cors_allow_methods: str
    cors_allow_headers: str
    upload_dir: str
    default_user_id: str
    default_workspace_id: str
    default_role: str
    postgres_user: str
    postgres_password: str
    postgres_host: str
    postgres_port: int
    postgres_db: str
    db_pool_min: int
    db_pool_max: int
    pinecone_api_key: str
    pinecone_index_name: str
    llm_api_key: str
    llm_base_url: str
    llm_model: str
    llm_temperature: float
    llm_max_output_tokens: int
    embedding_api_key: str
    embedding_base_url: str
    embedding_model: str
    http_timeout_seconds: float
    ingestion_workers: int
    ingestion_batch_size: int
    chunk_size: int
    chunk_overlap: int
    retrieval_top_k: int
    query_max_retries: int
    telemetry_limit: int
    evaluation_precision_baseline: float
    input_cost_per_million_tokens: float
    output_cost_per_million_tokens: float


settings = Settings()
