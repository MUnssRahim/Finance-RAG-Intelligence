from pathlib import Path
from types import SimpleNamespace

import fitz
from fastapi.testclient import TestClient

from app import ingestion, query
from app.api import routes
from app.main import app
from app.providers import LLMResponse, generate_embeddings


WORKSPACE_ID = "test-workspace"


def test_cohere_embeddings_payload_is_normalized(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"embeddings": {"float": [[0.1, 0.2], [0.3, 0.4]]}}

    monkeypatch.setattr("app.providers.httpx.post", lambda *args, **kwargs: FakeResponse())

    assert generate_embeddings(["one", "two"]) == [[0.1, 0.2], [0.3, 0.4]]


def create_pdf(path: Path, text: str = "Revenue increased by 25 percent in Q4.") -> bytes:
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), text)
    content = document.tobytes()
    document.close()
    path.write_bytes(content)
    return content


def test_pdf_upload_queues_file_for_ingestion(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    queued = []
    monkeypatch.setattr(routes.settings, "upload_dir", str(upload_dir))
    monkeypatch.setattr(
        routes,
        "run_concurrent_ingestion",
        lambda workspace_id, files: queued.append((workspace_id, files)),
    )

    pdf_content = create_pdf(tmp_path / "source.pdf")
    client = TestClient(app)
    response = client.post(
        f"/api/v1/workspaces/{WORKSPACE_ID}/upload",
        files={"files": ("random.pdf", pdf_content, "application/pdf")},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ingestion_queued", "files_count": 1}
    assert queued[0][0] == WORKSPACE_ID
    queued_file = Path(queued[0][1][0]["filepath"])
    assert queued_file.exists()
    assert queued_file.read_bytes() == pdf_content


def test_pdf_ingestion_extracts_text_and_upserts_vectors(tmp_path, monkeypatch):
    writes = []
    upserts = []
    pdf_path = tmp_path / "random.pdf"
    create_pdf(pdf_path, "Operating income was 42000 dollars.")

    class FakeIndex:
        def upsert(self, **kwargs):
            upserts.append(kwargs)

    monkeypatch.setattr(ingestion, "execute_read", lambda *args: [])
    monkeypatch.setattr(ingestion, "execute_write", lambda *args: writes.append(args))
    monkeypatch.setattr(ingestion, "generate_embeddings", lambda texts: [[0.1, 0.2] for _ in texts])
    monkeypatch.setattr(ingestion, "pinecone_index", lambda: FakeIndex())

    result = ingestion.ingest_unstructured_file(
        WORKSPACE_ID,
        str(pdf_path),
        "pdf",
        "random.pdf",
    )

    assert result["status"] == "success"
    assert result["type"] == "unstructured"
    assert result["chunks"] >= 1
    assert len(upserts) == 1
    vector = upserts[0]["vectors"][0]
    assert "Operating income was 42000 dollars." in vector["metadata"]["text"]
    assert vector["metadata"]["workspace_id"] == WORKSPACE_ID
    assert len(writes) == 2


def test_pdf_workspace_uses_rag_and_ai_receives_retrieved_text(monkeypatch):
    def fake_execute_read(sql, params=None):
        if "FROM datasets" in sql:
            return []
        if "FROM documents" in sql:
            return [{"filename": "random.pdf"}]
        raise AssertionError(f"Unexpected database query: {sql}")

    retrieved_text = "The PDF states that operating income was 42000 dollars."
    prompts = []

    async def fake_generate_response(prompt, system_prompt=""):
        prompts.append(prompt)
        return LLMResponse(
            content="According to random.pdf, operating income was 42000 dollars.",
            usage={"prompt_tokens": 10, "completion_tokens": 8},
            model="test-model",
        )

    monkeypatch.setattr(query, "execute_read", fake_execute_read)
    monkeypatch.setattr(query, "generate_embeddings", lambda texts, input_type="search_query": [[0.1, 0.2]])
    monkeypatch.setattr(
        query,
        "retrieve_vectors",
        lambda workspace_id, embedding, top_k: [
            {
                "id": "chunk-1",
                "score": 0.99,
                "metadata": {
                    "document_id": "document-1",
                    "chunk_id": "chunk-1",
                    "text": retrieved_text,
                    "filename": "random.pdf",
                    "page_number": 1,
                    "version": 1,
                },
            }
        ],
    )
    monkeypatch.setattr(query, "generate_response", fake_generate_response)

    import asyncio

    result = asyncio.run(query.process_user_query("What was operating income?", WORKSPACE_ID))

    assert result["route"] == "RAG"
    assert result["document_evidence"][0]["filename"] == "random.pdf"
    assert retrieved_text in prompts[-1]
    assert "42000 dollars" in result["answer"]
