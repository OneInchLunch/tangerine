"""Small in-process token-bucket limiter for the unauthenticated SSO routes."""

from __future__ import annotations

import ipaddress
import time
from dataclasses import dataclass

from starlette.requests import Request


@dataclass
class _Bucket:
    tokens: float
    updated: float


class TokenBucketLimiter:
    def __init__(
        self,
        *,
        per_minute: int,
        burst: int,
        global_per_minute: int = 0,
    ) -> None:
        self._rate = max(0.0, per_minute / 60.0)
        self._burst = max(1, burst)
        self._buckets: dict[str, _Bucket] = {}
        self._global_rate = max(0.0, global_per_minute / 60.0)
        self._global_burst = max(1, global_per_minute or per_minute)
        now = time.monotonic()
        self._global = _Bucket(float(self._global_burst), now)

    def allow(self, key: str, now: float | None = None) -> tuple[bool, int]:
        current = time.monotonic() if now is None else now
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = _Bucket(float(self._burst), current)
            self._buckets[key] = bucket
        elapsed = max(0.0, current - bucket.updated)
        bucket.tokens = min(float(self._burst), bucket.tokens + elapsed * self._rate)
        bucket.updated = current
        self._refill_global(current)
        if bucket.tokens < 1.0 or self._global.tokens < 1.0:
            retry = 1
            if self._global.tokens < 1.0 and self._global_rate > 0:
                retry = max(1, int((1.0 - self._global.tokens) / self._global_rate))
            elif self._rate > 0:
                retry = max(1, int((1.0 - bucket.tokens) / self._rate))
            return False, retry
        bucket.tokens -= 1.0
        self._global.tokens -= 1.0
        if len(self._buckets) > 10_000:
            cutoff = current - 300
            self._buckets = {
                name: item for name, item in self._buckets.items() if item.updated >= cutoff
            }
        return True, 0

    def _refill_global(self, now: float) -> None:
        elapsed = max(0.0, now - self._global.updated)
        self._global.tokens = min(
            float(self._global_burst), self._global.tokens + elapsed * self._global_rate
        )
        self._global.updated = now


def _matches_proxy(host: str, pattern: str) -> bool:
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return host == pattern
    try:
        return address in ipaddress.ip_network(pattern, strict=False)
    except ValueError:
        return host == pattern


def is_trusted_proxy(request: Request, trusted_proxies: tuple[str, ...] | list[str]) -> bool:
    """Whether the direct peer is allowed to assert forwarded client headers.

    An empty allowlist keeps the historical behavior and trusts the forwarded
    chain; set it once the tunnel/ingress addresses are known.
    """

    if not trusted_proxies:
        return True
    host = request.client.host if request.client else ""
    return any(_matches_proxy(host, pattern) for pattern in trusted_proxies)


def client_ip(request: Request, trusted_proxies: tuple[str, ...] | list[str] = ()) -> str:
    """Resolve the client address, only honoring forwarded headers from a trusted peer."""

    socket_ip = request.client.host if request.client else "unknown"
    if not is_trusted_proxy(request, trusted_proxies):
        return socket_ip
    forwarded = request.headers.get("cf-connecting-ip") or request.headers.get(
        "x-real-ip"
    )
    if forwarded:
        return forwarded.strip()
    chain = request.headers.get("x-forwarded-for")
    if chain:
        return chain.split(",", 1)[0].strip()
    return socket_ip
