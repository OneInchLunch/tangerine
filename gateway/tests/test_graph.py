import asyncio

import httpx
import pytest

from tangerine_gateway.graph import (
    GraphError,
    list_app_assignment_users,
    list_entra_groups,
    resolve_overage_groups,
    tenant_from_issuer,
)


def test_resolve_overage_groups_follows_pages():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if "page=2" in str(request.url):
            return httpx.Response(200, json={"value": [{"id": "group-2"}]})
        return httpx.Response(
            200,
            json={
                "value": [
                    {"id": "group-1", "@odata.type": "#microsoft.graph.group"},
                    {"id": "role-1", "@odata.type": "#microsoft.graph.directoryRole"},
                    {"id": "group-2", "@odata.type": "#microsoft.graph.group"},
                ],
                "@odata.nextLink": str(request.url) + "&page=2",
            },
        )

    groups = asyncio.run(
        resolve_overage_groups("token", transport=httpx.MockTransport(handler))
    )
    assert groups == ["group-1", "group-2", "group-2"]
    assert len(calls) == 2


def test_resolve_overage_groups_reports_http_errors():
    transport = httpx.MockTransport(lambda request: httpx.Response(403, text="denied"))
    with pytest.raises(GraphError):
        asyncio.run(resolve_overage_groups("token", transport=transport))


def test_tenant_from_issuer_handles_templates():
    assert (
        tenant_from_issuer("https://login.microsoftonline.com/tenant-id/v2.0")
        == "tenant-id"
    )
    assert tenant_from_issuer("https://login.microsoftonline.com/common/v2.0") == "common"
    assert tenant_from_issuer("https://idp.example.com") == "organizations"


def test_list_app_assignment_users_resolves_direct_and_group_members():
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.url.host == "login.microsoftonline.com":
            return httpx.Response(200, json={"access_token": "graph-token"})
        if path == "/v1.0/servicePrincipals":
            return httpx.Response(200, json={"value": [{"id": "sp-1"}]})
        if path.endswith("/appRoleAssignedTo"):
            return httpx.Response(
                200,
                json={
                    "value": [
                        {"principalId": "user-1", "principalType": "User"},
                        {"principalId": "group-1", "principalType": "Group"},
                    ]
                },
            )
        if path == "/v1.0/users/user-1":
            return httpx.Response(
                200,
                json={
                    "userPrincipalName": "alice_guest#EXT#@tenant.onmicrosoft.com",
                    "mail": "alice@example.com",
                    "otherMails": [],
                },
            )
        if path.endswith("/transitiveMembers/microsoft.graph.user"):
            return httpx.Response(
                200,
                json={
                    "value": [
                        {
                            "userPrincipalName": "bob_guest#EXT#@tenant.onmicrosoft.com",
                            "mail": None,
                            "otherMails": ["bob@example.com"],
                        },
                        {
                            "userPrincipalName": "carol@example.com",
                            "mail": None,
                            "otherMails": [],
                        },
                    ]
                },
            )
        raise AssertionError(f"unexpected Graph request: {request.url}")

    users = asyncio.run(
        list_app_assignment_users(
            "client",
            "secret",
            "https://login.microsoftonline.com/tenant/v2.0",
            transport=httpx.MockTransport(handler),
        )
    )
    assert users == ["alice@example.com", "bob@example.com", "carol@example.com"]


def test_list_entra_groups_uses_an_app_token_and_search():
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.host == "login.microsoftonline.com":
            assert b"client_credentials" in request.content
            assert b"Group.Read.All" not in request.content
            return httpx.Response(200, json={"access_token": "graph-token"})
        assert request.headers["authorization"] == "Bearer graph-token"
        assert request.headers["consistencylevel"] == "eventual"
        assert request.url.params["$search"] == '"displayName:Adm"'
        return httpx.Response(
            200,
            json={"value": [{"id": "group-1", "displayName": "Admins"}]},
        )

    groups = asyncio.run(
        list_entra_groups(
            "client",
            "secret",
            "https://login.microsoftonline.com/tenant-id/v2.0",
            query="Adm",
            transport=httpx.MockTransport(handler),
        )
    )

    assert groups == [{"id": "group-1", "label": "Admins"}]
    assert len(calls) == 2
