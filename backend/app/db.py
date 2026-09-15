from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from psycopg2 import pool
from .config import settings

_connection_pool: Optional[pool.ThreadedConnectionPool] = None


def get_pool() -> pool.ThreadedConnectionPool:
    global _connection_pool
    if _connection_pool is None:
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
    connection = get_pool().getconn()
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        get_pool().putconn(connection)


def execute_read(query: str, params: Optional[Tuple] = None) -> List[Dict[str, Any]]:
    connection = get_pool().getconn()
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            if not cursor.description:
                return []
            columns = [description[0] for description in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception:
        connection.rollback()
        raise
    finally:
        get_pool().putconn(connection)


def initialize_database() -> None:
    schema = Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")
    execute_write(schema)
