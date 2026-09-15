import ast
import json
import re
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from ..config import settings
from ..db import execute_read
from ..providers import generate_response
from ..storage import download_file


_CODE_BLOCK_PATTERN = re.compile(r"```python\s*(.*?)```", re.IGNORECASE | re.DOTALL)
_FORBIDDEN_NAMES = {"eval", "exec", "open", "os", "sys", "subprocess", "__import__"}
_SAFE_BUILTINS = {
    "abs": abs,
    "dict": dict,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "max": max,
    "min": min,
    "round": round,
    "str": str,
    "sum": sum,
    "tuple": tuple,
}


def _workspace_dataset_paths(workspace_id: str) -> List[Tuple[str, str, str]]:
    rows = execute_read(
        "SELECT filename, file_type, storage_path FROM datasets WHERE workspace_id = %s ORDER BY created_at DESC",
        (workspace_id,),
    )
    workspace_dir = Path(settings.storage_dir) / "workspaces" / workspace_id
    paths = []
    for row in rows:
        filename = Path(str(row.get("filename", ""))).name
        file_type = str(row.get("file_type") or Path(filename).suffix.lstrip(".")).lower()
        if file_type in {"csv", "xlsx"}:
            storage_path = str(row.get("storage_path") or "")
            if storage_path:
                paths.append((storage_path, filename, file_type))
                continue
            path = workspace_dir / filename
            if path.is_file():
                paths.append((str(path), filename, file_type))
    return paths


def _load_workspace_data(workspace_id: str) -> Tuple[Dict[str, pd.DataFrame], List[Dict[str, Any]]]:
    dataframes: Dict[str, pd.DataFrame] = {}
    summaries: List[Dict[str, Any]] = []
    for source, filename, file_type in _workspace_dataset_paths(workspace_id):
        file_content = download_file(source) if not Path(source).is_file() else None
        dataframe_source = BytesIO(file_content) if file_content is not None else source
        dataframe = pd.read_excel(dataframe_source) if file_type == "xlsx" else pd.read_csv(dataframe_source)
        dataframes[filename] = dataframe
        summaries.append(
            {
                "filename": filename,
                "columns": dataframe.columns.tolist(),
                "dtypes": {column: str(dtype) for column, dtype in dataframe.dtypes.items()},
                "sample_rows": dataframe.head(2).to_dict(orient="records"),
            }
        )
    return dataframes, summaries


def _extract_code(response: str) -> str:
    match = _CODE_BLOCK_PATTERN.search(response)
    if not match:
        raise ValueError("The model response did not contain a ```python``` code block")
    return match.group(1).strip()


def _validate_code(code: str) -> None:
    tree = ast.parse(code, mode="exec")
    assigned_result = False
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            raise ValueError("Imports are not allowed in the Pandas execution agent")
        if isinstance(node, ast.Name) and node.id in _FORBIDDEN_NAMES:
            raise ValueError(f"Forbidden name in generated code: {node.id}")
        if isinstance(node, ast.Attribute) and node.attr in _FORBIDDEN_NAMES:
            raise ValueError(f"Forbidden attribute in generated code: {node.attr}")
        if isinstance(node, ast.Assign):
            assigned_result = assigned_result or any(
                isinstance(target, ast.Name) and target.id == "result" for target in node.targets
            )
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            assigned_result = assigned_result or node.target.id == "result"
    if not assigned_result:
        raise ValueError("Generated code must assign the final value to result")


def _to_native(value: Any) -> Any:
    if isinstance(value, pd.DataFrame):
        return _to_native(value.to_dict(orient="records"))
    if isinstance(value, pd.Series):
        return _to_native(value.to_dict())
    if isinstance(value, np.generic):
        return _to_native(value.item())
    if isinstance(value, dict):
        return {str(key): _to_native(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_to_native(item) for item in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _execute_code(code: str, dataframes: Dict[str, pd.DataFrame]) -> Any:
    _validate_code(code)
    execution_globals = {
        "__builtins__": _SAFE_BUILTINS,
        "pd": pd,
        "np": np,
        "dfs": dataframes,
        "result": None,
    }
    exec(compile(code, "<pandas-agent>", "exec"), execution_globals, execution_globals)
    return _to_native(execution_globals.get("result"))


def _usage(response: Any) -> Tuple[int, int]:
    usage = getattr(response, "usage", {})
    if isinstance(usage, dict):
        return usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
    return getattr(usage, "prompt_tokens", 0), getattr(usage, "completion_tokens", 0)


async def generate_and_execute_pandas(
    query: str,
    workspace_id: str,
    max_retries: Optional[int] = None,
) -> dict:
    dataframes, summaries = _load_workspace_data(workspace_id)
    total_prompt_tokens = 0
    total_completion_tokens = 0
    final_code = ""
    last_error = ""
    max_retries = max_retries or settings.query_max_retries

    if not dataframes:
        return {
            "code": "",
            "data": None,
            "usage": {"prompt_tokens": 0, "completion_tokens": 0},
            "error": "No CSV files found for this workspace",
        }

    system_prompt = (
        "You are a Pandas data analysis code interpreter. Generate only executable Python code "
        "inside one ```python``` block, with no conversational filler. The dataframes are already "
        "loaded in dfs, a dictionary mapping exact filenames to pandas DataFrames. Do not load files, "
        "import modules, access the filesystem, or use os, sys, subprocess, open, eval, or exec. "
        "Use only pd, np, and dfs. Assign the final answer to a global variable named result.\n\n"
        f"Workspace CSV metadata:\n{json.dumps(summaries, default=str)}"
    )
    current_prompt = f"User question: {query}"

    for attempt in range(max_retries):
        try:
            response = await generate_response(current_prompt, system_prompt)
            prompt_tokens, completion_tokens = _usage(response)
            total_prompt_tokens += prompt_tokens
            total_completion_tokens += completion_tokens
            final_code = _extract_code(response.content)
            result = _execute_code(final_code, dataframes)
            return {
                "code": final_code,
                "data": result,
                "usage": {
                    "prompt_tokens": total_prompt_tokens,
                    "completion_tokens": total_completion_tokens,
                },
            }
        except Exception as error:
            last_error = str(error)
            if attempt < max_retries - 1:
                current_prompt = (
                    f"User question: {query}\n\n"
                    f"Previous generated code:\n```python\n{final_code}\n```\n\n"
                    f"Execution error: {last_error}\n"
                    "Return corrected executable Python in one ```python``` block and assign the result variable."
                )

    return {
        "code": final_code,
        "data": None,
        "usage": {
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
        },
        "error": last_error,
    }
