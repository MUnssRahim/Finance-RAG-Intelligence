import hashlib
import os
import uuid
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import fitz
import numpy as np
import pandas as pd
from docx import Document
from pinecone import Pinecone

from .db import execute_read, execute_write
from .config import settings
from .providers import generate_embeddings
from .storage import upload_file, download_file


MAX_WORKERS = settings.ingestion_workers
executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)


def workspace_storage_dir(workspace_id: str) -> Path:
    workspace_dir = Path(settings.storage_dir) / "workspaces" / Path(workspace_id).name
    os.makedirs(workspace_dir, exist_ok=True)
    return workspace_dir


def save_structured_file(workspace_id: str, filename: str, content: bytes) -> str:
    safe_filename = Path(filename).name
    if Path(safe_filename).suffix.lower() not in {".csv", ".xlsx"}:
        raise ValueError("Only CSV and XLSX files can be stored as structured datasets")
    object_path = f"{workspace_id}/{uuid.uuid4()}-{safe_filename}"
    upload_file(object_path, content)
    return f"storage://{object_path}"


def save_csv_file(workspace_id: str, filename: str, content: bytes) -> str:
    return save_structured_file(workspace_id, filename, content)


def extract_document_pages(filepath: str, file_type: str) -> List[Dict[str, Any]]:
    if file_type == "pdf":
        with fitz.open(filepath) as document:
            return [{"page_number": page_number, "text": page.get_text()} for page_number, page in enumerate(document, 1)]
    if file_type == "docx":
        document = Document(filepath)
        return [{"page_number": 1, "text": "\n".join(paragraph.text for paragraph in document.paragraphs)}]
    if file_type == "txt":
        return [{"page_number": 1, "text": Path(filepath).read_text(encoding="utf-8", errors="replace")}]
    raise ValueError(f"Unsupported unstructured file type: {file_type}")


def extract_pdf_text(filepath: str) -> str:
    with fitz.open(filepath) as document:
        return "\n".join(page.get_text() for page in document)


def chunk_text(text: str, chunk_size: Optional[int] = None, overlap: Optional[int] = None) -> List[str]:
    chunk_size = chunk_size or settings.chunk_size
    overlap = settings.chunk_overlap if overlap is None else overlap
    chunks = []
    start = 0
    while start < len(text):
        chunks.append(text[start:start + chunk_size])
        start += chunk_size - overlap
    return chunks


def profile_financial_dataset(source: Any, file_type: str) -> Dict[str, Any]:
    dataframe = pd.read_csv(source) if file_type == "csv" else pd.read_excel(source)
    row_count = len(dataframe)
    column_count = len(dataframe.columns)
    missing_values = int(dataframe.isnull().sum().sum())
    duplicate_records = int(dataframe.duplicated().sum())
    negative_values = sum(int((dataframe[column] < 0).sum()) for column in dataframe.select_dtypes(include=[np.number]).columns)
    total_cells = row_count * column_count
    error_rate = (missing_values + duplicate_records + negative_values) / total_cells if total_cells else 0
    return {"row_count": row_count, "column_count": column_count, "missing_values": missing_values, "duplicate_records": duplicate_records, "negative_values": negative_values, "overall_quality_score": round(max(0.0, min(100.0, 100.0 - error_rate * 100)), 2), "columns": list(dataframe.columns)}


def pinecone_index():
    return Pinecone(api_key=settings.pinecone_api_key).Index(settings.pinecone_index_name)


def upsert_vectors(vectors: List[Dict[str, Any]], batch_size: Optional[int] = None) -> None:
    batch_size = batch_size or settings.ingestion_batch_size
    index = pinecone_index()
    workspace_id = vectors[0]["metadata"]["workspace_id"]
    for start in range(0, len(vectors), batch_size):
        index.upsert(vectors=vectors[start:start + batch_size], namespace=workspace_id)


def retrieve_vectors(workspace_id: str, embedding: List[float], top_k: Optional[int] = None):
    top_k = top_k or settings.retrieval_top_k
    response = pinecone_index().query(namespace=workspace_id, vector=embedding, top_k=top_k, include_metadata=True, filter={"workspace_id": workspace_id})
    return response.get("matches", []) if isinstance(response, dict) else response.matches


def ingest_structured_file(workspace_id: str, filepath: str, file_type: str, filename: str) -> Dict[str, Any]:
    if file_type not in {"csv", "xlsx"}:
        raise ValueError(f"Unsupported structured file type: {file_type}")
    storage_path = filepath.removeprefix("storage://") if filepath.startswith("storage://") else ""
    source = BytesIO(download_file(storage_path)) if storage_path else filepath
    metrics = profile_financial_dataset(source, file_type)
    dataset_id = str(uuid.uuid4())
    execute_write("INSERT INTO datasets (dataset_id, workspace_id, filename, file_type, storage_path, row_count, quality_score, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)", (dataset_id, workspace_id, filename, file_type, storage_path, metrics["row_count"], metrics["overall_quality_score"], datetime.now(timezone.utc)))
    return {"status": "success", "type": "structured", "dataset_id": dataset_id, "metrics": metrics}


def ingest_unstructured_file(workspace_id: str, filepath: str, file_type: str, filename: str) -> Dict[str, Any]:
    content_hash = hashlib.sha256(Path(filepath).read_bytes()).hexdigest()
    existing = execute_read("SELECT document_id, version FROM documents WHERE workspace_id = %s AND content_hash = %s AND active = TRUE LIMIT 1", (workspace_id, content_hash))
    if existing:
        return {"status": "skipped", "reason": "duplicate", "document_id": str(existing[0]["document_id"]), "version": existing[0]["version"]}

    previous = execute_read("SELECT COALESCE(MAX(version), 0) AS version FROM documents WHERE workspace_id = %s AND filename = %s", (workspace_id, filename))
    version = int(previous[0]["version"]) + 1 if previous else 1
    document_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{workspace_id}:{content_hash}:{version}"))
    pages = extract_document_pages(filepath, file_type)
    chunks = []
    for page in pages:
        for chunk_index, text in enumerate(chunk_text(page["text"]), 1):
            chunks.append({"chunk_id": f"{document_id}:{page['page_number']}:{chunk_index}", "text": text, "page_number": page["page_number"], "chunk_index": chunk_index})
    if not chunks:
        raise ValueError("Document contains no extractable text")
    embeddings = generate_embeddings([chunk["text"] for chunk in chunks])
    uploaded_at = datetime.now(timezone.utc).isoformat()
    vectors = [{"id": chunk["chunk_id"], "values": embedding, "metadata": {"document_id": document_id, "workspace_id": workspace_id, "text": chunk["text"], "filename": filename, "file_type": file_type, "page_number": chunk["page_number"], "chunk_id": chunk["chunk_id"], "version": version, "access_level": "workspace", "uploaded_at": uploaded_at}} for chunk, embedding in zip(chunks, embeddings)]
    upsert_vectors(vectors)
    execute_write("UPDATE documents SET active = FALSE WHERE workspace_id = %s AND filename = %s", (workspace_id, filename))
    execute_write("INSERT INTO documents (document_id, workspace_id, filename, chunk_count, version, content_hash, active, created_at) VALUES (%s, %s, %s, %s, %s, %s, TRUE, %s)", (document_id, workspace_id, filename, len(chunks), version, content_hash, datetime.now(timezone.utc)))
    return {"status": "success", "type": "unstructured", "document_id": document_id, "chunks": len(chunks), "version": version}


def ingest_file(workspace_id: str, file_info: Dict[str, str]) -> Dict[str, Any]:
    file_type = file_info["file_type"]
    if file_type in {"csv", "xlsx"}:
        return ingest_structured_file(workspace_id, file_info["filepath"], file_type, file_info["filename"])
    if file_type in {"pdf", "docx", "txt"}:
        return ingest_unstructured_file(workspace_id, file_info["filepath"], file_type, file_info["filename"])
    raise ValueError(f"Unsupported file type: {file_type}")


def run_concurrent_ingestion(workspace_id: str, files: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    futures = [executor.submit(ingest_file, workspace_id, item) for item in files]
    results = []
    for future in as_completed(futures):
        try:
            results.append(future.result())
        except Exception as error:
            results.append({"status": "error", "error": str(error)})
    return results
