import uuid
import re
import json
import logging
from .db import execute_write
from .config import settings

logger = logging.getLogger(__name__)

# Exact API pricing for openai/gpt-oss-120b on Groq
def calculate_cost(input_tokens: int, output_tokens: int) -> float:
    in_cost = (input_tokens / 1_000_000) * settings.input_cost_per_million_tokens
    out_cost = (output_tokens / 1_000_000) * settings.output_cost_per_million_tokens
    return in_cost + out_cost

def evaluate_response(answer: str, sql_evidence: dict, doc_evidence: list) -> dict:
    """Heuristic evaluation for Hallucination and Recall without extra LLM latency."""
    hallucinated = False
    recall_score = 1.0

    # 1. SQL Hallucination Check: Detect if LLM invented numbers not in the database
    if sql_evidence and sql_evidence.get("data"):
        ans_nums = set(re.findall(r'\b\d+(?:\.\d+)?\b', answer))
        sql_nums = set(re.findall(r'\b\d+(?:\.\d+)?\b', str(sql_evidence.get("data"))))
        
        # Strip small numbers/years (e.g., Q2, 2025) to avoid false positives
        ans_large_nums = {n for n in ans_nums if float(n) > 2050}
        sql_large_nums = {n for n in sql_nums if float(n) > 2050}
        
        # If the answer has large financial numbers not present in the SQL output, flag it
        if ans_large_nums - sql_large_nums:
            hallucinated = True

    # 2. RAG Recall Score: Check if key terms from the answer are grounded in the documents
    if doc_evidence:
        combined_docs = " ".join([d.get("text", "") for d in doc_evidence]).lower()
        if combined_docs:
            words = set([w.lower() for w in answer.split() if len(w) > 5])
            if words:
                matched = sum(1 for w in words if w in combined_docs)
                recall_score = matched / len(words)

    return {
        "hallucination": hallucinated,
        "recall_score": round(recall_score, 4)
    }

def log_request_telemetry(workspace_id, query, route, latency, input_tokens, output_tokens, status, error, answer="", sql_evidence=None, doc_evidence=None):
    sql_evidence = sql_evidence or {}
    doc_evidence = doc_evidence or []
    cost = calculate_cost(input_tokens, output_tokens)
    metrics = evaluate_response(answer, sql_evidence, doc_evidence)
    
    metrics["input_tokens"] = input_tokens
    metrics["output_tokens"] = output_tokens
    
    try:
        sql = """
        INSERT INTO audit_logs (request_id, workspace_id, query, route, latency, total_cost, status, metrics)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        execute_write(sql, (
            str(uuid.uuid4()), workspace_id, query, route, latency, cost, status, json.dumps(metrics)
        ))
    except Exception as e:
        logger.error(f"Failed to log telemetry: {e}")