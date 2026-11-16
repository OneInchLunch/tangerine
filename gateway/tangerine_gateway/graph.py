"""Resolve Microsoft Graph group overage for Entra ID tokens."""

from __future__ import annotations

import re
from typing import Any, Mapping
from urllib.parse import quote

import httpx

GRAPH_MEMBER_OF = "https://graph.microsoft.com/v1.0/me/memberOf"
GRAPH_GROUPS = "https://graph.microsoft.com/v1.0/groups"
GRAPH_SERVICE_PRINCIPALS = "https://graph.microsoft.com/v1.0/servicePrincipals"
GRAPH_USERS = "https://graph.microsoft.com/v1.0/users"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"
MAX_PAGES = 10
TENANT_RE = re.compile(r"login\.microsoftonline\.com/([^/]+)/", re.IGNORECASE)


class GraphError(RuntimeError):
    """Raised when the Graph membership lookup fails."""


def tenant_from_issuer(issuer: str) -> str:
    match = TENANT_RE.search(issuer)
    return match.group(1) if match else "organizations"


async def resolve_overage_groups(
    access_token: str,
    *,
    timeout: float = 20.0,
    verify: bool = True,
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[str]:
    """Return group object IDs for the current user.

    The Entra ID ``groups`` claim contains group object IDs. When the claim is
    overaged it is omitted and ``_claim_names.groups`` points at this data.
    """

    groups: list[str] = []
    url: str | None = f"{GRAPH_MEMBER_OF}?$select=id,displayName&$top=999"
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(
            timeout=timeout, verify=verify, transport=transport
        ) as client:
            for _ in range(MAX_PAGES):
                if not url:
                    break
                response = await client.get(url, headers=headers)
                if response.status_code != 200:
                    raise GraphError(
                        f"Graph memberOf returned {response.status_code}: {response.text[:200]}"
                    )
                payload: dict[str, Any] = response.json()
                for entry in payload.get("value") or []:
                    entry_type = entry.get("@odata.type")
                    if isinstance(entry_type, str) and entry_type.lower() != "#microsoft.graph.group":
                        continue
                    identifier = entry.get("id")
                    if isinstance(identifier, str) and identifier:
                        groups.append(identifier)
                url = payload.get("@odata.nextLink")
    except httpx.HTTPError as exc:
        raise GraphError(f"Graph is unreachable: {exc}") from exc
    return groups


async def _graph_token(
    client_id: str,
    client_secret: str,
    issuer: str,
    *,
    timeout: float,
    verify: bool,
    transport: httpx.AsyncBaseTransport | None,
) -> str:
    if not client_secret:
        raise GraphError("the Microsoft client secret is empty")
    tenant = tenant_from_issuer(issuer)
    token_url = f"https://login.microsoftonline.com/{quote(tenant)}/oauth2/v2.0/token"
    try:
        async with httpx.AsyncClient(
            timeout=timeout, verify=verify, transport=transport
        ) as client:
            response = await client.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "scope": GRAPH_SCOPE,
                },
                headers={"Accept": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise GraphError(f"Graph is unreachable: {exc}") from exc
    if response.status_code != 200:
        raise GraphError(
            "Graph token exchange returned "
            f"{response.status_code}: {response.text[:200]}"
        )
    access_token = response.json().get("access_token")
    if not access_token:
        raise GraphError("Graph token exchange did not return an access token")
    return str(access_token)


async def _graph_pages(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str],
    params: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    values: list[dict[str, Any]] = []
    next_url: str | None = url
    first = True
    for _ in range(MAX_PAGES):
        if not next_url:
            break
        response = await client.get(
            next_url, headers=headers, params=params if first else None
        )
        first = False
        if response.status_code != 200:
            raise GraphError(
                f"Graph request returned {response.status_code}: {response.text[:200]}"
            )
        payload = response.json()
        values.extend(payload.get("value") or [])
        next_url = payload.get("@odata.nextLink")
    return values


def _login_identity(user: Mapping[str, Any]) -> str | None:
    mail = user.get("mail")
    if isinstance(mail, str) and mail:
        return mail
    other = user.get("otherMails")
    if isinstance(other, list):
        for value in other:
            if isinstance(value, str) and value:
                return value
    upn = user.get("userPrincipalName")
    return upn if isinstance(upn, str) and upn else None


async def list_app_assignment_users(
    client_id: str,
    client_secret: str,
    issuer: str,
    *,
    timeout: float = 20.0,
    verify: bool = True,
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[str]:
    """Return the best login identity for users authorized by the app.

    Prefer ``mail``, then the first ``otherMails`` entry, then
    ``userPrincipalName``. B2B guest UPNs contain the ``#EXT#`` marker and do
    not match the identity the ID token/login flow provisions.
    """

    access_token = await _graph_token(
        client_id,
        client_secret,
        issuer,
        timeout=timeout,
        verify=verify,
        transport=transport,
    )
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(
            timeout=timeout, verify=verify, transport=transport
        ) as client:
            principals = await _graph_pages(
                client,
                GRAPH_SERVICE_PRINCIPALS,
                headers=headers,
                params={
                    "$filter": f"appId eq '{client_id}'",
                    "$select": "id",
                },
            )
            service_principal = next(
                (item.get("id") for item in principals if item.get("id")), None
            )
            if not service_principal:
                raise GraphError("Tangerine service principal was not found")
            assignments = await _graph_pages(
                client,
                f"{GRAPH_SERVICE_PRINCIPALS}/{service_principal}/appRoleAssignedTo",
                headers=headers,
                params={"$select": "principalId,principalType"},
            )
            users: set[str] = set()
            for assignment in assignments:
                principal_id = assignment.get("principalId")
                principal_type = assignment.get("principalType")
                if not isinstance(principal_id, str):
                    continue
                if principal_type == "User":
                    response = await client.get(
                        f"{GRAPH_USERS}/{principal_id}",
                        headers=headers,
                        params={"$select": "userPrincipalName,mail,otherMails"},
                    )
                    if response.status_code != 200:
                        raise GraphError(
                            "Graph user lookup returned "
                            f"{response.status_code}: {response.text[:200]}"
                        )
                    identity = _login_identity(response.json())
                    if identity:
                        users.add(identity)
                elif principal_type == "Group":
                    members = await _graph_pages(
                        client,
                        f"{GRAPH_GROUPS}/{principal_id}/transitiveMembers/microsoft.graph.user",
                        headers=headers,
                        params={"$select": "userPrincipalName,mail,otherMails"},
                    )
                    for member in members:
                        identity = _login_identity(member)
                        if identity:
                            users.add(identity)
            return sorted(users)
    except httpx.HTTPError as exc:
        raise GraphError(f"Graph is unreachable: {exc}") from exc


async def list_entra_groups(
    client_id: str,
    client_secret: str,
    issuer: str,
    *,
    query: str = "",
    limit: int = 100,
    timeout: float = 20.0,
    verify: bool = True,
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[dict[str, str]]:
    """List Entra groups with an app-only token for the access-rule picker.

    Requires the app registration to hold ``Group.Read.All`` (application) with
    admin consent. The picker falls back to free text when this fails.
    """

    if not client_secret:
        raise GraphError("the Microsoft client secret is empty")

    tenant = tenant_from_issuer(issuer)
    token_url = (
        f"https://login.microsoftonline.com/{quote(tenant)}/oauth2/v2.0/token"
    )
    try:
        async with httpx.AsyncClient(
            timeout=timeout, verify=verify, transport=transport
        ) as client:
            token_response = await client.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "scope": GRAPH_SCOPE,
                },
                headers={"Accept": "application/json"},
            )
            if token_response.status_code != 200:
                raise GraphError(
                    "Graph token exchange returned "
                    f"{token_response.status_code}: {token_response.text[:200]}"
                )
            access_token = token_response.json().get("access_token")
            if not access_token:
                raise GraphError("Graph token exchange did not return an access token")

            params: dict[str, str] = {
                "$select": "id,displayName",
                "$top": str(max(1, min(limit, 200))),
            }
            needle = query.strip()
            if needle:
                params["$search"] = f'"displayName:{needle}"'
            response = await client.get(
                GRAPH_GROUPS,
                params=params,
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {access_token}",
                    "ConsistencyLevel": "eventual",
                },
            )
            if response.status_code != 200:
                raise GraphError(
                    f"Graph groups returned {response.status_code}: {response.text[:200]}"
                )
            payload = response.json()
            results: list[dict[str, str]] = []
            for entry in payload.get("value") or []:
                identifier = entry.get("id")
                if not isinstance(identifier, str) or not identifier:
                    continue
                label = entry.get("displayName") or identifier
                results.append({"id": identifier, "label": str(label)})
            return results
    except httpx.HTTPError as exc:
        raise GraphError(f"Graph is unreachable: {exc}") from exc
