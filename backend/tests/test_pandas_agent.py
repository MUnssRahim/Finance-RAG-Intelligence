import asyncio

import pandas as pd
import pytest

from app import ingestion
from app.providers import LLMResponse
from app.retrieval import pandas_agent


WORKSPACE_ID = "workspace-csv-test"


def test_csv_is_persisted_and_dataset_metadata_is_recorded(tmp_path, monkeypatch):
    uploaded = {}
    csv_content = b"department,revenue\nNorth,125.5\nSouth,80\n"
    monkeypatch.setattr(ingestion, "upload_file", lambda path, content: uploaded.setdefault(path, content))
    monkeypatch.setattr(ingestion, "download_file", lambda path: uploaded[path])
    writes = []
    monkeypatch.setattr(ingestion, "execute_write", lambda query, params: writes.append((query, params)))

    csv_path = ingestion.save_csv_file(
        WORKSPACE_ID,
        "sales.csv",
        csv_content,
    )
    result = ingestion.ingest_structured_file(WORKSPACE_ID, csv_path, "csv", "sales.csv")

    assert uploaded[next(iter(uploaded))] == csv_content
    assert result["status"] == "success"
    assert result["metrics"]["row_count"] == 2
    assert len(writes) == 1
    assert writes[0][1][1] == WORKSPACE_ID
    assert writes[0][1][2] == "sales.csv"
    assert writes[0][1][3] == "csv"
    assert writes[0][1][4] == next(iter(uploaded))
    assert writes[0][1][5] == 2


def test_xlsx_is_persisted_and_loaded_by_pandas_agent(tmp_path, monkeypatch):
    storage_dir = tmp_path / "storage"
    source = tmp_path / "budget.xlsx"
    pd.DataFrame({"department": ["North"], "budget": [125.5]}).to_excel(source, index=False)

    monkeypatch.setattr(ingestion.settings, "storage_dir", str(storage_dir))
    uploaded = {}
    content = source.read_bytes()
    monkeypatch.setattr(ingestion, "upload_file", lambda path, value: uploaded.setdefault(path, value))
    monkeypatch.setattr(ingestion, "download_file", lambda path: uploaded[path])
    writes = []
    monkeypatch.setattr(ingestion, "execute_write", lambda query, params: writes.append(params))
    storage_path = ingestion.save_structured_file(WORKSPACE_ID, "budget.xlsx", content)
    result = ingestion.ingest_structured_file(WORKSPACE_ID, storage_path, "xlsx", "budget.xlsx")

    assert result["status"] == "success"
    assert uploaded[next(iter(uploaded))] == content
    assert writes[0][3] == "xlsx"
    assert writes[0][4] == next(iter(uploaded))

    monkeypatch.setattr(pandas_agent.settings, "storage_dir", str(storage_dir))
    object_path = next(iter(uploaded))
    monkeypatch.setattr(
        pandas_agent,
        "execute_read",
        lambda *args: [{"filename": "budget.xlsx", "file_type": "xlsx", "storage_path": object_path}],
    )
    monkeypatch.setattr(pandas_agent, "download_file", lambda path: uploaded[path])
    dataframes, _ = pandas_agent._load_workspace_data(WORKSPACE_ID)
    assert dataframes["budget.xlsx"]["budget"].tolist() == [125.5]


def test_pandas_agent_retries_failed_code_and_returns_native_data(tmp_path, monkeypatch):
    storage_dir = tmp_path / "storage"
    workspace_dir = storage_dir / "workspaces" / WORKSPACE_ID
    workspace_dir.mkdir(parents=True)
    pd.DataFrame({"revenue": [10.5, 20.0]}).to_csv(workspace_dir / "sales.csv", index=False)

    monkeypatch.setattr(pandas_agent.settings, "storage_dir", str(storage_dir))
    monkeypatch.setattr(
        pandas_agent,
        "execute_read",
        lambda *args: [{"filename": "sales.csv"}],
    )
    responses = iter(
        [
            LLMResponse(
                content="```python\nresult = dfs['sales.csv']['missing'].sum()\n```",
                usage={"prompt_tokens": 3, "completion_tokens": 4},
                model="test-model",
            ),
            LLMResponse(
                content="```python\nresult = {'total': np.float64(dfs['sales.csv']['revenue'].sum())}\n```",
                usage={"prompt_tokens": 5, "completion_tokens": 6},
                model="test-model",
            ),
        ]
    )
    async def fake_generate_response(*args, **kwargs):
        return next(responses)

    monkeypatch.setattr(pandas_agent, "generate_response", fake_generate_response)

    result = asyncio.run(
        pandas_agent.generate_and_execute_pandas(
            "What is the total revenue?",
            WORKSPACE_ID,
            max_retries=2,
        )
    )

    assert result["data"] == {"total": 30.5}
    assert result["usage"] == {"prompt_tokens": 8, "completion_tokens": 10}
    assert "sales.csv" in result["code"]
    assert "error" not in result


def test_pandas_agent_rejects_forbidden_operations():
    with pytest.raises(ValueError, match="Imports are not allowed"):
        pandas_agent._execute_code("import os\nresult = 1", {})

    with pytest.raises(ValueError, match="Forbidden name"):
        pandas_agent._execute_code("result = open('secret.txt')", {})
