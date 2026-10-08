"""Rate limiter unit test (pure, no DB)."""
from app.core.rate_limit import RateLimiter


def test_limiter_blocks_after_quota():
    lim = RateLimiter(max_calls=3, window_seconds=60)
    assert lim.check("k")[0] is True
    assert lim.check("k")[0] is True
    assert lim.check("k")[0] is True
    allowed, retry = lim.check("k")
    assert allowed is False and retry >= 1
