import asyncio
import json

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from tangerine_gateway.google_groups import (
    GoogleGroupsError,
    list_group_members,
    list_workspace_groups,
    resolve_workspace_groups,
)


def service_account_json() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_key = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    return json.dumps(
        {
            "client_email": "sync@example.iam.gserviceaccount.com",
            "private_key": private_key,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    )


def test_resolve_workspace_groups_exchanges_an_assertion_and_follows_pages():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if str(request.url) == "https://oauth2.googleapis.com/token":
            return httpx.Response(200, json={"access_token": "google-token"})
        assert request.headers["authorization"] == "Bearer google-token"
        if "pageToken=next" in str(request.url):
            return httpx.Response(200, json={"groups": [{"email": "second@example.com"}]})
        return httpx.Response(
            200,
            json={
                "groups": [
                    {"email": "first@example.com"},
                    {"name": "Fallback group"},
                ],
                "nextPageToken": "next",
            },
        )

    groups = asyncio.run(
        resolve_workspace_groups(
            service_account_json(),
            admin_email="admin@example.com",
            user_email="alice@example.com",
            transport=httpx.MockTransport(handler),
        )
    )
    assert groups == ["first@example.com", "Fallback group", "second@example.com"]
    assert len(calls) == 3


def test_resolve_workspace_groups_rejects_invalid_service_account():
    with pytest.raises(GoogleGroupsError):
        asyncio.run(
            resolve_workspace_groups(
                "not-json",
                admin_email="admin@example.com",
                user_email="alice@example.com",
            )
        )


def test_list_group_members_follows_pages():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if str(request.url) == "https://oauth2.googleapis.com/token":
            return httpx.Response(200, json={"access_token": "google-token"})
        assert request.headers["authorization"] == "Bearer google-token"
        if "pageToken=next" in str(request.url):
            return httpx.Response(200, json={"members": [{"email": "b@example.com"}]})
        return httpx.Response(
            200,
            json={
                "members": [{"email": "a@example.com"}],
                "nextPageToken": "next",
            },
        )

    members = asyncio.run(
        list_group_members(
            service_account_json(),
            admin_email="admin@example.com",
            group_email="team@example.com",
            transport=httpx.MockTransport(handler),
        )
    )
    assert members == ["a@example.com", "b@example.com"]
    assert len(calls) == 3


def test_list_workspace_groups_filters_the_picker_results():
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "https://oauth2.googleapis.com/token":
            return httpx.Response(200, json={"access_token": "google-token"})
        assert request.headers["authorization"] == "Bearer google-token"
        assert "customer=my_customer" in str(request.url)
        return httpx.Response(
            200,
            json={
                "groups": [
                    {"email": "admins@example.com", "name": "Admins"},
                    {"email": "developers@example.com", "name": "Developers"},
                ]
            },
        )

    groups = asyncio.run(
        list_workspace_groups(
            service_account_json(),
            admin_email="admin@example.com",
            query="adm",
            transport=httpx.MockTransport(handler),
        )
    )

    assert groups == [{"id": "admins@example.com", "label": "Admins"}]
