import asyncio

import httpx
import pytest

from tangerine_gateway.pulp import PulpClient, PulpError, TaskTimeout


def test_username_for_session_cookie_does_not_send_the_service_account():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["authorization"] = request.headers.get("authorization")
        seen["cookie"] = request.headers.get("cookie")
        return httpx.Response(200, json={"username": "alice"})

    client = PulpClient(
        "http://pulp.invalid",
        "svc-gateway",
        "service-password",
        transport=httpx.MockTransport(handler),
    )
    username = asyncio.run(client.username_for_session_cookie("sessionid=abc"))
    asyncio.run(client.aclose())

    assert username == "alice"
    assert seen["authorization"] is None
    assert seen["cookie"] == "sessionid=abc"


def test_username_for_session_cookie_rejects_an_invalid_cookie():
    transport = httpx.MockTransport(
        lambda request: httpx.Response(401, json={"detail": "not signed in"})
    )
    client = PulpClient(
        "http://pulp.invalid",
        "svc-gateway",
        "service-password",
        transport=transport,
    )

    assert asyncio.run(client.username_for_session_cookie("sessionid=bogus")) is None
    asyncio.run(client.aclose())


def test_add_group_role_sends_null_prn_for_global():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        seen["body"] = json.loads(request.content)
        return httpx.Response(201, json={})

    client = PulpClient(
        "http://pulp.invalid",
        "svc-gateway",
        "service-password",
        transport=httpx.MockTransport(handler),
    )
    asyncio.run(
        client.add_group_role("/pulp/api/v3/groups/1/", role="tangerine-viewer")
    )
    asyncio.run(client.aclose())

    assert seen["body"] == {
        "role": "tangerine-viewer",
        "content_object_prn": None,
    }


def test_the_service_account_client_still_uses_basic_auth():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["authorization"] = request.headers.get("authorization")
        return httpx.Response(200, json={"results": []})

    client = PulpClient(
        "http://pulp.invalid",
        "svc-gateway",
        "service-password",
        transport=httpx.MockTransport(handler),
    )
    asyncio.run(client.get_user("alice"))
    asyncio.run(client.aclose())

    assert seen["authorization"].startswith("Basic ")


def test_foreign_absolute_urls_never_leave_the_origin():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, json={"results": []})

    client = PulpClient(
        "http://pulp.invalid",
        "svc-gateway",
        "service-password",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(PulpError) as error:
        asyncio.run(client.get_resource("http://evil.example/pulp/api/v3/users/"))
    asyncio.run(client.aclose())

    assert error.value.status == 400
    assert seen == []


def test_dot_segments_cannot_reach_another_pulp_endpoint():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(200, json={})

    client = PulpClient(
        "http://pulp.invalid",
        "svc-gateway",
        "service-password",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(PulpError) as error:
        asyncio.run(
            client.get_resource("/pulp/api/v3/distributions/../../users/")
        )
    asyncio.run(client.aclose())

    assert error.value.status == 400
    assert seen == []


def test_pagination_refuses_a_foreign_next_link():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(
            200,
            json={
                "results": [],
                "next": "http://evil.example/pulp/api/v3/users/?offset=1",
            },
        )

    client = PulpClient(
        "http://pulp.invalid",
        "svc-gateway",
        "service-password",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(PulpError):
        asyncio.run(client.list_resources("/pulp/api/v3/users/"))
    asyncio.run(client.aclose())

    assert len(seen) == 1
    assert seen[0].startswith("http://pulp.invalid/pulp/api/v3/users/")


def test_await_task_polls_until_completed():
    states = iter(
        [
            {"state": "running", "task": "/pulp/api/v3/tasks/1/"},
            {"state": "completed", "task": "/pulp/api/v3/tasks/1/"},
        ]
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=next(states))

    client = PulpClient(
        "http://pulp.invalid",
        "svc-gateway",
        "service-password",
        transport=httpx.MockTransport(handler),
    )
    task = asyncio.run(
        client.await_task("/pulp/api/v3/tasks/1/", timeout=5, interval=0)
    )
    asyncio.run(client.aclose())

    assert task["state"] == "completed"


def test_await_task_reports_a_pending_task_on_timeout():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"state": "running"})

    client = PulpClient(
        "http://pulp.invalid",
        "svc-gateway",
        "service-password",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(TaskTimeout) as error:
        asyncio.run(
            client.await_task("/pulp/api/v3/tasks/1/", timeout=0, interval=0)
        )
    asyncio.run(client.aclose())

    assert error.value.task["state"] == "running"
