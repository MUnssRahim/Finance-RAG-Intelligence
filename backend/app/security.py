from fastapi import HTTPException, Request
from .config import settings


def current_identity(request: Request) -> dict[str, str]:
    return {"user_id": request.headers.get("x-user-id", settings.default_user_id), "workspace_id": request.headers.get("x-workspace-id", settings.default_workspace_id), "role": request.headers.get("x-role", settings.default_role)}


def require_workspace(identity: dict[str, str], workspace_id: str) -> None:
    if identity["workspace_id"] != workspace_id:
        raise HTTPException(status_code=403, detail="Workspace access denied")


def can_read_document(identity: dict[str, str], document: dict) -> bool:
    return identity["workspace_id"] == document["workspace_id"] and identity["role"] in {"Owner", "Analyst", "Viewer"}
