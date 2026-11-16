from tangerine_gateway.rate_limit import TokenBucketLimiter


def test_token_bucket_allows_burst_then_limits():
    limiter = TokenBucketLimiter(per_minute=60, burst=2, global_per_minute=0)
    assert limiter.allow("a", now=100.0)[0] is True
    assert limiter.allow("a", now=100.0)[0] is True
    allowed, retry = limiter.allow("a", now=100.0)
    assert allowed is False
    assert retry >= 1


def test_token_bucket_refills_over_time():
    limiter = TokenBucketLimiter(per_minute=60, burst=1, global_per_minute=0)
    assert limiter.allow("a", now=100.0)[0] is True
    assert limiter.allow("a", now=100.0)[0] is False
    assert limiter.allow("a", now=101.1)[0] is True


def test_token_bucket_separates_clients():
    limiter = TokenBucketLimiter(per_minute=60, burst=1, global_per_minute=0)
    assert limiter.allow("a", now=100.0)[0] is True
    assert limiter.allow("b", now=100.0)[0] is True


def test_client_ip_only_honors_forwarded_headers_from_trusted_proxies():
    from starlette.requests import Request

    from tangerine_gateway.rate_limit import client_ip

    def make(host, headers):
        return Request(
            {
                "type": "http",
                "headers": [(name.lower().encode(), value.encode()) for name, value in headers],
                "client": (host, 1234),
            }
        )

    headers = [("CF-Connecting-IP", "203.0.113.9")]
    assert client_ip(make("10.0.0.5", headers), ["10.0.0.5"]) == "203.0.113.9"
    assert client_ip(make("10.0.0.5", headers), ["10.0.0.0/8"]) == "203.0.113.9"
    assert client_ip(make("192.0.2.9", headers), ["10.0.0.5"]) == "192.0.2.9"
    assert client_ip(make("10.0.0.5", headers), []) == "203.0.113.9"


def test_client_ip_prefers_cf_then_real_ip_then_forwarded_chain():
    from starlette.requests import Request

    from tangerine_gateway.rate_limit import client_ip

    def make(headers):
        return Request(
            {
                "type": "http",
                "headers": [(name.lower().encode(), value.encode()) for name, value in headers],
                "client": ("10.0.0.5", 1234),
            }
        )

    assert (
        client_ip(
            make(
                [
                    ("CF-Connecting-IP", "203.0.113.9"),
                    ("X-Real-IP", "198.51.100.2"),
                    ("X-Forwarded-For", "198.51.100.1, 10.0.0.1"),
                ]
            )
        )
        == "203.0.113.9"
    )
    assert client_ip(make([("X-Real-IP", "198.51.100.2")])) == "198.51.100.2"
    assert (
        client_ip(make([("X-Forwarded-For", "198.51.100.1, 10.0.0.1")]))
        == "198.51.100.1"
    )
    assert client_ip(make([])) == "10.0.0.5"
