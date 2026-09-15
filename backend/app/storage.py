from urllib.parse import quote

import httpx

from .config import settings


def _storage_url(object_path: str) -> str:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase Storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    encoded_path = quote(object_path.lstrip("/"), safe="/")
    return f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{settings.supabase_storage_bucket}/{encoded_path}"


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
    }


def upload_file(object_path: str, content: bytes) -> None:
    response = httpx.post(
        _storage_url(object_path),
        content=content,
        headers={**_headers(), "Content-Type": "application/octet-stream", "x-upsert": "true"},
        timeout=settings.http_timeout_seconds,
    )
    response.raise_for_status()


def download_file(object_path: str) -> bytes:
    response = httpx.get(
        _storage_url(object_path),
        headers=_headers(),
        timeout=settings.http_timeout_seconds,
    )
    response.raise_for_status()
    return response.content