"""Lightweight in-memory rate limiter (no new dependencies).

Used for login / invitation endpoints. For multi-worker production,
replace with Redis-backed limiting — the `check` API stays the same.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, max_calls: int, window_seconds: int):
        self.max_calls = max_calls
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> tuple[bool, int]:
        """Return (allowed, retry_after_seconds)."""
        now = time.monotonic()
        bucket = self._hits[key]
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()
        if len(bucket) >= self.max_calls:
            retry = int(self.window - (now - bucket[0])) + 1
            return False, max(retry, 1)
        bucket.append(now)
        return True, 0


login_limiter = RateLimiter(max_calls=20, window_seconds=60)
invite_limiter = RateLimiter(max_calls=30, window_seconds=60)
