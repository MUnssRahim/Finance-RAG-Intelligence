from typing import List

import httpx
from groq import AsyncGroq
from pydantic import BaseModel

from .config import settings


class LLMResponse(BaseModel):
    content: str
    usage: dict
    model: str


async def generate_response(prompt: str, system_prompt: str = "") -> LLMResponse:
    async with AsyncGroq(api_key=settings.llm_api_key, base_url=settings.llm_base_url) as client:
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
        return LLMResponse(
            content=completion.choices[0].message.content or "",
            usage=completion.usage.model_dump() if completion.usage else {},
            model=completion.model,
        )


def generate_embeddings(texts: List[str], input_type: str = "search_document") -> List[List[float]]:
    response = httpx.post(
        settings.embedding_base_url,
        headers={"Authorization": f"Bearer {settings.embedding_api_key}", "Content-Type": "application/json"},
        json={"texts": texts, "model": settings.embedding_model, "input_type": input_type, "truncate": "END"},
        timeout=settings.http_timeout_seconds,
    )
    response.raise_for_status()
    return response.json()["embeddings"]
