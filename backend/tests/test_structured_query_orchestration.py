import asyncio

from app import query
from app.providers import LLMResponse


def test_structured_query_returns_pandas_code_and_accumulates_usage(monkeypatch):
    async def fake_classify_query(user_query, workspace_id):
        return "STRUCTURED", {"prompt_tokens": 1, "completion_tokens": 2}

    async def fake_pandas_agent(user_query, workspace_id):
        return {
            "code": "result = {'total': 42}",
            "data": {"total": 42},
            "usage": {"prompt_tokens": 3, "completion_tokens": 4},
        }

    async def fake_generate_response(prompt, system_prompt=""):
        return LLMResponse(
            content="The computed total is 42.",
            usage={"prompt_tokens": 5, "completion_tokens": 6},
            model="test-model",
        )

    monkeypatch.setattr(query, "classify_query", fake_classify_query)
    monkeypatch.setattr(query, "generate_and_execute_pandas", fake_pandas_agent)
    monkeypatch.setattr(query, "generate_response", fake_generate_response)

    result = asyncio.run(query.process_user_query("What is the total?", "workspace"))

    assert result["route"] == "STRUCTURED"
    assert result["sql_evidence"] == {
        "code": "result = {'total': 42}",
        "data": {"total": 42},
    }
    assert result["usage"] == {"prompt_tokens": 9, "completion_tokens": 12}
    assert "42" in result["answer"]
