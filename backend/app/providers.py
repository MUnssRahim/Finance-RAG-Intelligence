from typing import List
import logging
import time

import httpx
from groq import AsyncGroq
from pydantic import BaseModel

from .config import settings

logger = logging.getLogger(__name__)


class LLMResponse(BaseModel):
    content: str
    usage: dict
    model: str


async def generate_response(prompt: str, system_prompt: str = "") -> LLMResponse:
    started = time.perf_counter()
    logger.info("llm_start model=%s prompt_chars=%s system_chars=%s", settings.llm_model, len(prompt), len(system_prompt))
    async with AsyncGroq(api_key=settings.llm_api_key, base_url=settings.llm_base_url) as client:
        try:
            completion = await client.chat.completions.create(
                model=settings.llm_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                temperature=settings.llm_temperature,
                max_tokens=settings.llm_max_output_tokens,
                stream=False,
            )
        except Exception:
            logger.exception("llm_error model=%s duration_ms=%.1f", settings.llm_model, (time.perf_counter() - started) * 1000)
            raise
        usage = completion.usage.model_dump() if completion.usage else {}
        logger.info("llm_success model=%s response_chars=%s prompt_tokens=%s completion_tokens=%s duration_ms=%.1f", completion.model, len(completion.choices[0].message.content or ""), usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), (time.perf_counter() - started) * 1000)
        return LLMResponse(
            content=completion.choices[0].message.content or "",
            usage=usage,
            model=completion.model,
        )


def generate_embeddings(texts: List[str], input_type: str = "search_document") -> List[List[float]]:
    started = time.perf_counter()
    logger.info("embedding_start model=%s input_type=%s text_count=%s text_chars=%s", settings.embedding_model, input_type, len(texts), sum(len(text) for text in texts))
    try:
        response = httpx.post(
            settings.embedding_base_url,
            headers={"Authorization": f"Bearer {settings.embedding_api_key}", "Content-Type": "application/json"},
            json={"texts": texts, "model": settings.embedding_model, "input_type": input_type, "truncate": "END"},
            timeout=settings.http_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        logger.exception("embedding_error model=%s input_type=%s duration_ms=%.1f", settings.embedding_model, input_type, (time.perf_counter() - started) * 1000)
        raise
    embeddings = payload.get("embeddings")
    if isinstance(embeddings, dict):
        embeddings = embeddings.get("float")
    if not isinstance(embeddings, list) or not all(isinstance(vector, list) for vector in embeddings):
        raise ValueError("Embedding provider returned an invalid embeddings payload")
    if len(embeddings) != len(texts):
        raise ValueError("Embedding provider returned a different number of vectors than inputs")
    logger.info("embedding_success model=%s vector_count=%s dimension=%s duration_ms=%.1f", settings.embedding_model, len(embeddings), len(embeddings[0]) if embeddings else 0, (time.perf_counter() - started) * 1000)
    return embeddings
