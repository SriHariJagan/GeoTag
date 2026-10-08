"""Shared server-driven pagination (page/limit + X-Total-Count header).

List endpoints keep returning plain JSON arrays (backward compatible);
the total matching row count travels in the `X-Total-Count` response
header (exposed via CORS) so frontends can render real pagers.
"""
from __future__ import annotations

from fastapi import Query, Response

DEFAULT_LIMIT = 20
MAX_LIMIT = 100
TOTAL_HEADER = "X-Total-Count"


def page_param(default: int = 1):
    return Query(default, ge=1, description="1-based page number")


def limit_param(default: int = DEFAULT_LIMIT):
    return Query(default, ge=1, le=MAX_LIMIT, description="Rows per page")


def paginate_query(query, page: int, limit: int):
    """Return (items, total) for an ordered SQLAlchemy query."""
    total = query.order_by(None).count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    return items, total


def set_total(response: Response, total: int) -> None:
    response.headers[TOTAL_HEADER] = str(total)
