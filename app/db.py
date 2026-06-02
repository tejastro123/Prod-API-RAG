"""
Database layer — auto-detects backend from DATABASE_URL:

  postgresql://...  →  Neon PostgreSQL via asyncpg  (cloud / production)
  sqlite://...      →  local aiosqlite              (development fallback)

DATABASE_URL is read directly from the environment (set in .env).

Both backends expose the same interface to main.py:
  - await db.execute(sql, params)          — for INSERT / UPDATE / DELETE
  - async with db.execute(sql, params) as cursor: rows = await cursor.fetchall()
  - await db.commit()                      — no-op for asyncpg (auto-commit)
"""

import json
import logging
import os

logger = logging.getLogger("production-api")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_database_url() -> str:
    return os.getenv("DATABASE_URL", "")


def _is_postgres(url: str) -> bool:
    return url.startswith("postgresql") or url.startswith("postgres")


def _to_pg_sql(sql: str) -> str:
    """Replace SQLite ? placeholders with asyncpg $1, $2, … placeholders."""
    parts = sql.split("?")
    result = parts[0]
    for i, part in enumerate(parts[1:], start=1):
        result += f"${i}" + part
    return result


# ---------------------------------------------------------------------------
# PostgreSQL Schema (BIGINT timestamps, DOUBLE PRECISION floats)
# ---------------------------------------------------------------------------

PG_SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS threads (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL DEFAULT 'anonymous',
        title         TEXT,
        created_at    BIGINT NOT NULL,
        updated_at    BIGINT NOT NULL,
        message_count INTEGER DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS messages (
        id                 TEXT PRIMARY KEY,
        thread_id          TEXT NOT NULL,
        role               TEXT CHECK(role IN ('user','assistant')),
        content            TEXT NOT NULL,
        model_used         TEXT,
        cached             INTEGER DEFAULT 0,
        processing_time_ms DOUBLE PRECISION,
        security_notes     TEXT,
        created_at         BIGINT NOT NULL,
        FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS request_log (
        id               TEXT PRIMARY KEY,
        thread_id        TEXT,
        user_id          TEXT DEFAULT 'anonymous',
        prompt_raw       TEXT NOT NULL,
        prompt_sanitized TEXT,
        response         TEXT,
        model_used       TEXT,
        cached           INTEGER,
        latency_ms       DOUBLE PRECISION,
        cache_hit        INTEGER,
        security_notes   TEXT,
        error            TEXT,
        timestamp        BIGINT NOT NULL
    )
    """,
]

# ---------------------------------------------------------------------------
# SQLite Schema
# ---------------------------------------------------------------------------

SQLITE_SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'anonymous',
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        message_count INTEGER DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT CHECK(role IN ('user','assistant')),
        content TEXT NOT NULL,
        model_used TEXT,
        cached INTEGER DEFAULT 0,
        processing_time_ms REAL,
        security_notes TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS request_log (
        id TEXT PRIMARY KEY,
        thread_id TEXT,
        user_id TEXT DEFAULT 'anonymous',
        prompt_raw TEXT NOT NULL,
        prompt_sanitized TEXT,
        response TEXT,
        model_used TEXT,
        cached INTEGER,
        latency_ms REAL,
        cache_hit INTEGER,
        security_notes TEXT,
        error TEXT,
        timestamp INTEGER NOT NULL
    )
    """,
]


# ---------------------------------------------------------------------------
# PostgreSQL compatibility wrapper
# ---------------------------------------------------------------------------

class _PgCursor:
    """Fake cursor that fetchall() returns list[dict]."""
    def __init__(self, rows):
        self._rows = rows

    async def fetchall(self):
        return [dict(r) for r in self._rows]


class _PgExecuteHandle:
    """
    Returned by PgConnection.execute(sql, params).

    Supports BOTH:
      await db.execute(sql, params)                    — write (INSERT/UPDATE/DELETE)
      async with db.execute(sql, params) as cursor:    — read (SELECT)
    """
    def __init__(self, conn, sql: str, params: tuple):
        self._conn = conn
        self._sql = _to_pg_sql(sql)
        self._params = params

    # ── awaitable: write path ──────────────────────────────────────────────
    def __await__(self):
        return self._run().__await__()

    async def _run(self):
        await self._conn.execute(self._sql, *self._params)

    # ── async context manager: read (SELECT) path ─────────────────────────
    async def __aenter__(self):
        rows = await self._conn.fetch(self._sql, *self._params)
        return _PgCursor(rows)

    async def __aexit__(self, *args):
        pass


class _PgConnection:
    """Wraps an asyncpg connection to look like aiosqlite to main.py."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql: str, params: tuple = ()) -> _PgExecuteHandle:
        return _PgExecuteHandle(self._conn, sql, params)

    async def commit(self):
        pass  # asyncpg is auto-commit by default


# ---------------------------------------------------------------------------
# init_db — called once on startup (lifespan)
# ---------------------------------------------------------------------------

async def init_db():
    """Create tables if they don't exist yet."""
    db_url = _get_database_url()

    if _is_postgres(db_url):
        try:
            import asyncpg
            conn = await asyncpg.connect(db_url)
            try:
                for stmt in PG_SCHEMA_STATEMENTS:
                    await conn.execute(stmt.strip())
                logger.info("PostgreSQL (Neon) database initialized successfully.")
            finally:
                await conn.close()
        except Exception as e:
            logger.error(f"Failed to initialize PostgreSQL database: {e}")
    else:
        try:
            import aiosqlite
            sqlite_path = (
                db_url
                .replace("sqlite+aiosqlite:///", "")
                .replace("sqlite:///", "")
                or "rag_app.db"
            )
            async with aiosqlite.connect(sqlite_path) as db:
                for stmt in SQLITE_SCHEMA_STATEMENTS:
                    await db.execute(stmt.strip())
                await db.commit()
                logger.info(f"SQLite database initialized at '{sqlite_path}'.")
        except Exception as e:
            logger.error(f"Failed to initialize SQLite database: {e}")


# ---------------------------------------------------------------------------
# get_db — FastAPI dependency
# ---------------------------------------------------------------------------

async def get_db():
    """
    FastAPI Depends() provider.
    Yields a db object whose .execute() works identically for
    both PostgreSQL (asyncpg) and SQLite (aiosqlite).
    """
    db_url = _get_database_url()

    if _is_postgres(db_url):
        import asyncpg
        conn = await asyncpg.connect(db_url)
        try:
            yield _PgConnection(conn)
        finally:
            await conn.close()
    else:
        import aiosqlite
        sqlite_path = (
            db_url
            .replace("sqlite+aiosqlite:///", "")
            .replace("sqlite:///", "")
            or "rag_app.db"
        )
        async with aiosqlite.connect(sqlite_path) as db:
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys = ON;")
            yield db
