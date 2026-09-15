import json
from decimal import Decimal
from typing import Any, Dict, List

from .providers import generate_response


def calculate_variance(actual: float, budget: float) -> dict[str, float]:
    variance = actual - budget
    return {"actual": actual, "budget": budget, "variance": round(variance, 2), "variance_percent": round((variance / budget) * 100, 2) if budget else 0}


def summarize_periods(periods: list[dict[str, float]]) -> dict[str, float]:
    revenue = sum(Decimal(str(item.get("revenue", 0))) for item in periods)
    expenses = sum(Decimal(str(item.get("expenses", 0))) for item in periods)
    return {"revenue": float(revenue), "expenses": float(expenses), "operating_income": float(revenue - expenses), "margin_percent": round(float((revenue - expenses) / revenue * 100), 2) if revenue else 0}


async def evaluate_answer_relevance(query: str, answer: str) -> float:
    response = await generate_response(f"Query: {query}\nAnswer: {answer}", "Return only JSON with a score from 0.0 to 1.0 measuring answer relevance.")
    try:
        return float(json.loads(response.content).get("score", 0.0))
    except Exception:
        return 0.0


async def evaluate_groundedness(answer: str, context: str) -> float:
    response = await generate_response(f"Context: {context}\nAnswer: {answer}", "Return only JSON with a score from 0.0 to 1.0 measuring groundedness.")
    try:
        return float(json.loads(response.content).get("score", 0.0))
    except Exception:
        return 0.0


async def run_evaluation(workspace_id: str, request_id: str, query: str, answer: str, context_docs: List[Dict[str, Any]]) -> Dict[str, float]:
    relevance = await evaluate_answer_relevance(query, answer)
    groundedness = await evaluate_groundedness(answer, "\n".join(doc.get("text", "") for doc in context_docs))
    return {"answer_relevance": relevance, "groundedness": groundedness}
