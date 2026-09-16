from pathlib import Path
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from psycopg2 import pool
from .config import settings

_connection_pool: Optional[pool.ThreadedConnectionPool] = None
logger = logging.getLogger(__name__)


def _query_name(query: str) -> str:
    return " ".join(query.split())[:120]


def get_pool() -> pool.ThreadedConnectionPool:
    global _connection_pool
    if _connection_pool is None:
        logger.info("db_pool_initialize min=%s max=%s host=%s port=%s database=%s", settings.db_pool_min, settings.db_pool_max, settings.postgres_host, settings.postgres_port, settings.postgres_db)
        _connection_pool = pool.ThreadedConnectionPool(
            minconn=settings.db_pool_min,
            maxconn=settings.db_pool_max,
            user=settings.postgres_user,
            password=settings.postgres_password,
            host=settings.postgres_host,
            port=str(settings.postgres_port),
            database=settings.postgres_db,
        )
    return _connection_pool


def execute_write(query: str, params: Optional[Tuple] = None) -> None:
    started = time.perf_counter()
    logger.info("db_write_start query=%s params_count=%s", _query_name(query), len(params or ()))
    connection = get_pool().getconn()
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
        connection.commit()
        logger.info("db_write_success query=%s duration_ms=%.1f", _query_name(query), (time.perf_counter() - started) * 1000)
    except Exception:
        connection.rollback()
        logger.exception("db_write_error query=%s duration_ms=%.1f", _query_name(query), (time.perf_counter() - started) * 1000)
        raise
    finally:
        get_pool().putconn(connection)


def execute_read(query: str, params: Optional[Tuple] = None) -> List[Dict[str, Any]]:
    started = time.perf_counter()
    logger.info("db_read_start query=%s params_count=%s", _query_name(query), len(params or ()))
    connection = get_pool().getconn()
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            if not cursor.description:
                logger.info("db_read_success query=%s rows=0 duration_ms=%.1f", _query_name(query), (time.perf_counter() - started) * 1000)
                return []
            columns = [description[0] for description in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
            logger.info("db_read_success query=%s rows=%s duration_ms=%.1f", _query_name(query), len(rows), (time.perf_counter() - started) * 1000)
            return rows
    except Exception:
        connection.rollback()
        logger.exception("db_read_error query=%s duration_ms=%.1f", _query_name(query), (time.perf_counter() - started) * 1000)
        raise
    finally:
        get_pool().putconn(connection)


def initialize_database() -> None:
    schema = Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")
    execute_write(schema)
