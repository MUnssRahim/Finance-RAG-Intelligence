import json
import logging
import time
from typing import Tuple

from .db import execute_read
from .ingestion import retrieve_vectors
from .providers import generate_embeddings, generate_response
from .config import settings
from .retrieval.pandas_agent import generate_and_execute_pandas

logger = logging.getLogger(__name__)

# Helper to safely extract token usage regardless of the LLM SDK format (dict vs object)
def extract_tokens(response) -> Tuple[int, int]:
    usage = getattr(response, "usage", {})
    if isinstance(usage, dict):
        return usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
    return getattr(usage, "prompt_tokens", 0), getattr(usage, "completion_tokens", 0)


async def classify_query(query: str, workspace_id: str) -> Tuple[str, dict]:
    """Route queries from the uploaded workspace file types."""
    usage_dict = {"prompt_tokens": 0, "completion_tokens": 0}
    logger.info("query_route_start workspace=%s query_chars=%s", workspace_id, len(query))
    
    # 1. Context-Aware File Check
    try:
        dataset_rows = execute_read("SELECT filename FROM datasets WHERE workspace_id = %s", (workspace_id,))
        document_rows = execute_read(
            "SELECT filename FROM documents WHERE workspace_id = %s AND active = TRUE",
            (workspace_id,),
        )
        has_csv = any(r.get("filename", "").lower().endswith((".csv", ".xlsx")) for r in dataset_rows)
        has_text = any(r.get("filename", "").lower().endswith((".txt", ".pdf", ".docx", ".md")) for r in document_rows)
    except Exception:
        has_csv, has_text = False, False

    # 2. Deterministic Routing (Bypass LLM)
    if has_csv and not has_text:
        logger.info("query_route_decision workspace=%s route=STRUCTURED reason=structured_only", workspace_id)
        return "STRUCTURED", usage_dict
    if has_text and not has_csv:
        logger.info("query_route_decision workspace=%s route=RAG reason=documents_only", workspace_id)
        return "RAG", usage_dict

    # 3. LLM Intent Routing
    system_prompt = "Classify as exactly STRUCTURED, RAG, HYBRID, or REPORT. Return only JSON with a route key."
    response = await generate_response(query, system_prompt)
    
    # Track routing tokens
    p_tokens, c_tokens = extract_tokens(response)
    usage_dict["prompt_tokens"] += p_tokens
    usage_dict["completion_tokens"] += c_tokens

    try:
        clean_json = response.content.replace("```json", "").replace("```", "").strip()
        route = json.loads(clean_json).get("route", "RAG").upper()
        if route == "SQL":
            route = "STRUCTURED"
        if route not in {"STRUCTURED", "RAG", "HYBRID", "REPORT"}:
            route = "RAG"
        logger.info("query_route_decision workspace=%s route=%s reason=llm", workspace_id, route)
        return route, usage_dict
    except json.JSONDecodeError:
        return "RAG", usage_dict


def retrieve_documents(query: str, workspace_id: str, top_k: int = None) -> list:
    """Fetches semantic chunks from Pinecone."""
    logger.info("document_retrieval_start workspace=%s query_chars=%s top_k=%s", workspace_id, len(query), top_k or settings.retrieval_top_k)
    embeddings = generate_embeddings([query], input_type="search_query")
    if not embeddings:
        return []
        
    matches = retrieve_vectors(workspace_id, embeddings[0], top_k or settings.retrieval_top_k)
    documents = [
        {
            "document_id": match.get("metadata", {}).get("document_id", ""),
            "chunk_id": match.get("metadata", {}).get("chunk_id", match.get("id", "")),
            "text": match.get("metadata", {}).get("text", ""),
            "filename": match.get("metadata", {}).get("filename", ""),
            "page_number": match.get("metadata", {}).get("page_number"),
            "version": match.get("metadata", {}).get("version"),
            "score": match.get("score", 0.0)
        } 
        for match in matches
    ]
    logger.info("document_retrieval_complete workspace=%s matches=%s scores=%s", workspace_id, len(documents), [round(float(item["score"]), 4) for item in documents])
    return documents


async def process_user_query(query: str, workspace_id: str) -> dict:
    """Orchestrate structured-data execution, RAG retrieval, and response synthesis."""
    total_prompt_tokens = 0
    total_completion_tokens = 0

    started = time.perf_counter()
    logger.info("query_pipeline_start workspace=%s query_chars=%s", workspace_id, len(query))
    # 1. Routing
    route, router_usage = await classify_query(query, workspace_id)
    total_prompt_tokens += router_usage["prompt_tokens"]
    total_completion_tokens += router_usage["completion_tokens"]

    # 2. Structured data execution
    pandas_data = {}
    if route in {"STRUCTURED", "DATA", "SQL", "HYBRID", "REPORT"}:
        pandas_data = await generate_and_execute_pandas(query, workspace_id)
        pandas_usage = pandas_data.get("usage", {})
        total_prompt_tokens += pandas_usage.get("prompt_tokens", 0)
        total_completion_tokens += pandas_usage.get("completion_tokens", 0)

    # 3. RAG Retrieval
    documents = []
    if route in {"RAG", "HYBRID", "REPORT"}:
        documents = retrieve_documents(query, workspace_id)

    # 4. Evidence Assembly
    evidence = []
    if pandas_data.get("data") is not None:
        evidence.append("Computed Data Evidence:\n" + str(pandas_data["data"]))
    
    if documents:
        evidence.append("Document evidence:\n" + "\n".join(f"{item['filename']}: {item['text']}" for item in documents))

    # 5. Final Synthesis
    final_prompt = f"Question: {query}\n\nEvidence:\n" + "\n\n".join(evidence)
    final_sys = "Use only the supplied evidence. State when evidence is insufficient and cite document filenames."
    
    answer = await generate_response(final_prompt, final_sys)
    
    # Add synthesis tokens
    p_tokens, c_tokens = extract_tokens(answer)
    total_prompt_tokens += p_tokens
    total_completion_tokens += c_tokens

    structured_evidence = {
        "code": pandas_data.get("code", ""),
        "data": pandas_data.get("data"),
    }
    if pandas_data.get("error"):
        structured_evidence["error"] = pandas_data["error"]

    result = {
        "route": route,
        "answer": answer.content,
        "sql_evidence": structured_evidence,
        "document_evidence": documents,
        "usage": {
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens
        }
    }
    logger.info("query_pipeline_complete workspace=%s route=%s documents=%s structured=%s duration_ms=%.1f", workspace_id, route, len(documents), pandas_data.get("data") is not None, (time.perf_counter() - started) * 1000)
    return result