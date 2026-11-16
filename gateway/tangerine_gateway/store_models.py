"""Provider models, validation, and shared provider SQL for the gateway store."""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

from .mapping import parse_role_spec

PROVIDER_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
PROVIDER_KINDS = {"azuread", "google", "keycloak", "oidc"}
USERNAME_CLAIMS = {"preferred_username", "upn", "email", "sub"}
USERNAME_PREFIX_RE = re.compile(r"^[A-Za-z0-9._@-]{0,30}$")
TENANT_ID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
ACCESS_RULE_CLAIMS = {"groups", "roles"}
DOMAIN_RE = re.compile(
    r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$"
)

MIGRATIONS_DIR = Path(__file__).with_name("migrations")
MIGRATION_LOCK_ID = 0x54414E47

class StoreError(RuntimeError):
    """Raised for invalid provider payloads."""


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _normalize_role_list(raw: Any, label: str) -> list[str]:
    """Parse and canonicalise ``role/domain/prn`` entries."""

    if raw is None:
        return []
    if not isinstance(raw, list):
        raise StoreError(f"{label} must be an array")
    result: list[str] = []
    for value in raw:
        text = str(value).strip()
        spec = parse_role_spec(text) if text else None
        if spec is None:
            raise StoreError(f"{label} contains an invalid role spec: {value!r}")
        normalized = str(spec)
        if normalized not in result:
            result.append(normalized)
    return result


@dataclass(frozen=True)
class Provider:
    id: str
    label: str
    kind: str
    issuer: str
    client_id: str
    secret_file: str
    scopes: str
    group_claim: str | None
    role_claim: str | None
    username_claim: str | None = None
    username_prefix: str | None = None
    require_email_verified: bool = False
    allowed_tenants: list[str] = field(default_factory=list)
    fetch_graph_groups: bool = False
    fetch_google_groups: bool = False
    google_service_account_file: str | None = None
    google_admin_email: str | None = None
    group_map: dict[str, str] = field(default_factory=dict)
    role_map: dict[str, str] = field(default_factory=dict)
    access_rules: list[dict[str, Any]] = field(default_factory=list)
    baseline_group: str | None = None
    baseline_roles: list[str] = field(default_factory=list)
    strict_groups: bool = False
    allowed_email_domains: list[str] = field(default_factory=list)
    require_hosted_domain: bool = False
    enabled: bool = True
    sort_order: int = 0
    created_at: str = ""
    updated_at: str = ""

    @property
    def group_claim_path(self) -> str:
        return self.group_claim or "groups"

    @property
    def role_claim_path(self) -> str:
        return self.role_claim or "roles"

    def to_public(self) -> dict[str, str]:
        """What an unauthenticated login screen may see."""

        return {"id": self.id, "label": self.label, "kind": self.kind}

    def to_admin(self) -> dict[str, Any]:
        """Configuration view. Never contains secret material."""

        return {
            "id": self.id,
            "label": self.label,
            "kind": self.kind,
            "issuer": self.issuer,
            "clientId": self.client_id,
            "secretFile": self.secret_file,
            "scopes": self.scopes,
            "groupClaim": self.group_claim or "",
            "roleClaim": self.role_claim or "",
            "usernameClaim": self.username_claim or "",
            "usernamePrefix": self.username_prefix or "",
            "requireEmailVerified": self.require_email_verified,
            "allowedTenants": self.allowed_tenants,
            "fetchGraphGroups": self.fetch_graph_groups,
            "fetchGoogleGroups": self.fetch_google_groups,
            "googleServiceAccountFile": self.google_service_account_file or "",
            "googleAdminEmail": self.google_admin_email or "",
            "groupMap": self.group_map,
            "roleMap": self.role_map,
            "accessRules": self.access_rules,
            "baselineGroup": self.baseline_group or "",
            "baselineRoles": self.baseline_roles,
            "strictGroups": self.strict_groups,
            "allowedEmailDomains": self.allowed_email_domains,
            "requireHostedDomain": self.require_hosted_domain,
            "enabled": self.enabled,
            "sortOrder": self.sort_order,
        }


@dataclass(frozen=True)
class Session:
    username: str
    provider_id: str | None
    subject: str | None
    id_token: str | None
    expires_at: float


@dataclass(frozen=True)
class IdentityAssertion:
    provider_id: str
    subject: str
    username: str
    groups: list[str] | None
    roles: list[str] | None
    asserted_at: float


def _row_to_provider(row: Mapping[str, Any]) -> Provider:
    return Provider(
        id=row["id"],
        label=row["label"],
        kind=row["kind"],
        issuer=row["issuer"],
        client_id=row["client_id"],
        secret_file=row["secret_file"],
        scopes=row["scopes"],
        group_claim=row["group_claim"],
        role_claim=row["role_claim"],
        username_claim=row["username_claim"],
        username_prefix=row["username_prefix"],
        require_email_verified=bool(row["require_email_verified"]),
        allowed_tenants=json.loads(row["allowed_tenants"] or "[]"),
        fetch_graph_groups=bool(row["fetch_graph_groups"]),
        fetch_google_groups=bool(row["fetch_google_groups"]),
        google_service_account_file=row["google_service_account_file"],
        google_admin_email=row["google_admin_email"],
        group_map=json.loads(row["group_map"] or "{}"),
        role_map=json.loads(row["role_map"] or "{}"),
        access_rules=json.loads(row["access_rules"] or "[]"),
        baseline_group=row["baseline_group"],
        baseline_roles=json.loads(row["baseline_roles"] or "[]"),
        strict_groups=bool(row["strict_groups"]),
        allowed_email_domains=json.loads(row["allowed_email_domains"] or "[]"),
        require_hosted_domain=bool(row["require_hosted_domain"]),
        enabled=bool(row["enabled"]),
        sort_order=row["sort_order"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _validate(
    payload: dict[str, Any], *, require_id: bool, allow_http_issuers: bool = False
) -> dict[str, Any]:
    provider_id = str(payload.get("id", "")).strip()
    label = str(payload.get("label", "")).strip()
    kind = str(payload.get("kind", "")).strip()
    issuer = str(payload.get("issuer", "")).strip().rstrip("/")
    client_id = str(payload.get("clientId", "")).strip()
    secret_file = str(payload.get("secretFile", "")).strip()

    if require_id:
        if not PROVIDER_ID_RE.match(provider_id):
            raise StoreError(
                "id must be lowercase letters, digits, dots, dashes, or underscores"
            )
    if not label:
        raise StoreError("label is required")
    if kind not in PROVIDER_KINDS:
        raise StoreError(f"kind must be one of: {', '.join(sorted(PROVIDER_KINDS))}")
    if not issuer.startswith("https://") and not issuer.startswith("http://localhost"):
        if not (allow_http_issuers and issuer.startswith("http://")):
            raise StoreError("issuer must be an https URL")

    raw_tenants = payload.get("allowedTenants") or []
    if not isinstance(raw_tenants, list):
        raise StoreError("allowedTenants must be an array")
    allowed_tenants = [str(value).strip() for value in raw_tenants if str(value).strip()]
    for tenant in allowed_tenants:
        if not TENANT_ID_RE.match(tenant):
            raise StoreError(f"invalid Microsoft tenant GUID: {tenant!r}")

    if kind == "azuread":
        lowered = issuer.lower()
        multi_tenant = any(
            f"/{authority}/v2.0" in lowered
            for authority in ("common", "organizations", "consumers")
        )
        if "{tenantid}" in lowered:
            raise StoreError("issuer must not contain the {tenantid} template")
        if multi_tenant and not allowed_tenants:
            raise StoreError(
                "multi-tenant Microsoft issuers require at least one allowed tenant GUID"
            )
    if not client_id:
        raise StoreError("clientId is required")
    if not secret_file:
        raise StoreError("secretFile is required")
    if "/" in secret_file or "\\" in secret_file:
        raise StoreError("secretFile must be a file name, not a path")

    username_claim = str(payload.get("usernameClaim") or "").strip() or None
    if username_claim is not None and username_claim not in USERNAME_CLAIMS:
        raise StoreError(
            f"usernameClaim must be one of: {', '.join(sorted(USERNAME_CLAIMS))}"
        )
    username_prefix = str(payload.get("usernamePrefix") or "").strip() or None
    if username_prefix is not None and not USERNAME_PREFIX_RE.match(username_prefix):
        raise StoreError(
            "usernamePrefix may contain letters, digits, dots, dashes, underscores, or @"
        )

    fetch_graph_groups = bool(payload.get("fetchGraphGroups"))
    fetch_google_groups = bool(payload.get("fetchGoogleGroups"))
    google_service_account_file = (
        str(payload.get("googleServiceAccountFile") or "").strip() or None
    )
    google_admin_email = str(payload.get("googleAdminEmail") or "").strip() or None
    if google_service_account_file and (
        "/" in google_service_account_file or "\\" in google_service_account_file
    ):
        raise StoreError("googleServiceAccountFile must be a file name, not a path")
    if fetch_google_groups and (not google_service_account_file or not google_admin_email):
        raise StoreError(
            "Google group sync requires googleServiceAccountFile and googleAdminEmail"
        )

    group_map = payload.get("groupMap")
    role_map = payload.get("roleMap")
    group_map = {} if group_map is None else group_map
    role_map = {} if role_map is None else role_map
    if not isinstance(group_map, dict):
        raise StoreError("groupMap must be an object")
    if not isinstance(role_map, dict):
        raise StoreError("roleMap must be an object")

    raw_rules = payload.get("accessRules")
    raw_rules = [] if raw_rules is None else raw_rules
    if not isinstance(raw_rules, list):
        raise StoreError("accessRules must be an array")
    access_rules: list[dict[str, Any]] = []
    seen_rules: set[tuple[str, str]] = set()
    for item in raw_rules:
        if not isinstance(item, dict):
            raise StoreError("each access rule must be an object")
        claim = str(item.get("claim") or "").strip()
        match = str(item.get("match") or "").strip()
        group = str(item.get("group") or "").strip()
        if claim not in ACCESS_RULE_CLAIMS:
            raise StoreError("access rule claim must be groups or roles")
        if not match:
            raise StoreError("access rule match is required")
        if not group:
            raise StoreError("access rule group is required")
        if len(group) > 150:
            raise StoreError("access rule group must be 150 characters or fewer")
        key = (claim, match)
        if key in seen_rules:
            raise StoreError(f"duplicate access rule for {claim}:{match}")
        seen_rules.add(key)
        access_rules.append(
            {
                "claim": claim,
                "match": match,
                "group": group,
                "roles": _normalize_role_list(
                    item.get("roles"), f"access rule roles for {match}"
                ),
            }
        )

    baseline_group = str(payload.get("baselineGroup") or "").strip() or None
    if baseline_group and len(baseline_group) > 150:
        raise StoreError("baselineGroup must be 150 characters or fewer")
    baseline_roles = _normalize_role_list(payload.get("baselineRoles"), "baselineRoles")

    raw_domains = payload.get("allowedEmailDomains")
    raw_domains = [] if raw_domains is None else raw_domains
    if not isinstance(raw_domains, list):
        raise StoreError("allowedEmailDomains must be an array")
    allowed_email_domains: list[str] = []
    for value in raw_domains:
        domain = str(value).strip().lower().lstrip("@")
        if not domain:
            raise StoreError("allowedEmailDomains contains an empty domain")
        if not DOMAIN_RE.match(domain):
            raise StoreError(f"invalid allowed email domain: {value!r}")
        if domain not in allowed_email_domains:
            allowed_email_domains.append(domain)
    require_hosted_domain = bool(payload.get("requireHostedDomain"))
    if require_hosted_domain:
        if kind != "google":
            raise StoreError("requireHostedDomain is only supported for Google providers")
        if not allowed_email_domains:
            raise StoreError(
                "requireHostedDomain requires at least one allowed email domain"
            )

    return {
        "id": provider_id,
        "label": label,
        "kind": kind,
        "issuer": issuer,
        "client_id": client_id,
        "secret_file": secret_file,
        "scopes": str(payload.get("scopes") or "openid profile email").strip(),
        "group_claim": str(payload.get("groupClaim") or "").strip() or None,
        "role_claim": str(payload.get("roleClaim") or "").strip() or None,
        "username_claim": username_claim,
        "username_prefix": username_prefix,
        "require_email_verified": bool(payload.get("requireEmailVerified")),
        "allowed_tenants": allowed_tenants,
        "fetch_graph_groups": fetch_graph_groups,
        "fetch_google_groups": fetch_google_groups,
        "google_service_account_file": google_service_account_file,
        "google_admin_email": google_admin_email,
        "group_map": {str(k): str(v) for k, v in group_map.items()},
        "role_map": {str(k): str(v) for k, v in role_map.items()},
        "access_rules": access_rules,
        "baseline_group": baseline_group,
        "baseline_roles": baseline_roles,
        "strict_groups": bool(payload.get("strictGroups")),
        "allowed_email_domains": allowed_email_domains,
        "require_hosted_domain": require_hosted_domain,
        "enabled": bool(payload.get("enabled", True)),
        "sort_order": int(payload.get("sortOrder") or 0),
    }


def validate_provider_payload(
    payload: dict[str, Any], *, require_id: bool = False, allow_http_issuers: bool = False
) -> dict[str, Any]:
    """Validate a provider payload without touching the database.

    Used by the admin API to check references (for example role names) before a
    row is written.
    """

    return _validate(payload, require_id=require_id, allow_http_issuers=allow_http_issuers)


def _provider_insert_params(values: dict[str, Any], now: str) -> tuple[Any, ...]:    return (
        values["id"],
        values["label"],
        values["kind"],
        values["issuer"],
        values["client_id"],
        values["secret_file"],
        values["scopes"],
        values["group_claim"],
        values["role_claim"],
        values["username_claim"],
        values["username_prefix"],
        values["require_email_verified"],
        json.dumps(values["allowed_tenants"]),
        values["fetch_graph_groups"],
        values["fetch_google_groups"],
        values["google_service_account_file"],
        values["google_admin_email"],
        json.dumps(values["group_map"]),
        json.dumps(values["role_map"]),
        json.dumps(values["access_rules"]),
        values["baseline_group"],
        json.dumps(values["baseline_roles"]),
        values["strict_groups"],
        json.dumps(values["allowed_email_domains"]),
        values["require_hosted_domain"],
        values["enabled"],
        values["sort_order"],
        now,
        now,
    )


def _provider_update_params(values: dict[str, Any], now: str) -> tuple[Any, ...]:
    return (
        values["label"],
        values["kind"],
        values["issuer"],
        values["client_id"],
        values["secret_file"],
        values["scopes"],
        values["group_claim"],
        values["role_claim"],
        values["username_claim"],
        values["username_prefix"],
        values["require_email_verified"],
        json.dumps(values["allowed_tenants"]),
        values["fetch_graph_groups"],
        values["fetch_google_groups"],
        values["google_service_account_file"],
        values["google_admin_email"],
        json.dumps(values["group_map"]),
        json.dumps(values["role_map"]),
        json.dumps(values["access_rules"]),
        values["baseline_group"],
        json.dumps(values["baseline_roles"]),
        values["strict_groups"],
        json.dumps(values["allowed_email_domains"]),
        values["require_hosted_domain"],
        values["enabled"],
        values["sort_order"],
        now,
        values["id"],
    )


_PROVIDER_INSERT_SQL = """
    INSERT INTO providers (
        id, label, kind, issuer, client_id, secret_file, scopes,
        group_claim, role_claim, username_claim, username_prefix,
        require_email_verified, allowed_tenants, fetch_graph_groups,
        fetch_google_groups, google_service_account_file, google_admin_email,
        group_map, role_map, access_rules, baseline_group, baseline_roles,
        strict_groups, allowed_email_domains, require_hosted_domain,
        enabled, sort_order, created_at, updated_at
    ) VALUES ({placeholders})
"""

_PROVIDER_UPDATE_SQL = """
    UPDATE providers SET
        label = {p}, kind = {p}, issuer = {p}, client_id = {p}, secret_file = {p},
        scopes = {p}, group_claim = {p}, role_claim = {p}, username_claim = {p},
        username_prefix = {p}, require_email_verified = {p}, allowed_tenants = {p},
        fetch_graph_groups = {p}, fetch_google_groups = {p},
        google_service_account_file = {p}, google_admin_email = {p},
        group_map = {p}, role_map = {p}, access_rules = {p}, baseline_group = {p},
        baseline_roles = {p}, strict_groups = {p}, allowed_email_domains = {p},
        require_hosted_domain = {p}, enabled = {p}, sort_order = {p}, updated_at = {p}
    WHERE id = {p}
"""


