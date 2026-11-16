"""Pure helpers that turn identity-provider claims into Pulp identities.

Nothing in this module imports Django or pulpcore, so it can be unit tested on
its own. Django and Pulp wiring lives in :mod:`tangerine_pulp_sso.pipeline`.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping

DEFAULT_GROUP_CLAIM = "groups"
DEFAULT_ROLE_CLAIM = "roles"

# Claims providers put the user payload under instead of at the top level.
_USER_PAYLOAD_KEYS = ("user_data", "userinfo", "profile")


@dataclass(frozen=True)
class RoleSpec:
    """A Pulp role assignment expressed the same way the SAML2 backend does.

    ``role/domain/prn`` where ``domain`` and ``prn`` may be empty to mean "no
    domain" and "global object".
    """

    role: str
    domain: str = ""
    object_prn: str = ""

    def __str__(self) -> str:
        return f"{self.role}/{self.domain}/{self.object_prn}"


@dataclass(frozen=True)
class AccessRule:
    """One declarative IdP-value to Pulp-group mapping."""

    claim: str
    match: str
    group: str
    roles: tuple[str, ...] = ()


@dataclass(frozen=True)
class RuleResolution:
    """Groups and group roles resolved from a provider's access rules."""

    desired_groups: frozenset[str] = frozenset()
    declared_groups: frozenset[str] = frozenset()
    group_roles: Mapping[str, frozenset[str]] = field(default_factory=dict)
    groups_asserted: bool = False
    roles_asserted: bool = False


def claim_values(claims: Mapping[str, Any], path: str) -> list[str] | None:
    """Read a dotted claim path.

    Returns ``None`` when the claim is absent, which callers treat as "the
    identity provider said nothing" rather than "the user has no groups". An
    empty list means the claim was present and empty.
    """

    node: Any = claims
    for part in path.split("."):
        if not isinstance(node, Mapping) or part not in node:
            return None
        node = node[part]

    if isinstance(node, str):
        values: Iterable[Any] = [node]
    elif isinstance(node, (list, tuple, set, frozenset)):
        values = node
    else:
        return None

    result: list[str] = []
    for value in values:
        if value is None or isinstance(value, (dict, list, tuple, set)):
            continue
        text = str(value).strip()
        if text:
            result.append(text)
    return result


def resolve_access_rules(
    claims: Mapping[str, Any],
    rules: Iterable[AccessRule],
    *,
    group_claim: str = DEFAULT_GROUP_CLAIM,
    role_claim: str = DEFAULT_ROLE_CLAIM,
) -> RuleResolution:
    """Resolve declarative rules against the claims the provider asserted."""

    group_values = claim_values(claims, group_claim)
    role_values = claim_values(claims, role_claim)
    asserted = {
        "groups": set(group_values or ()),
        "roles": set(role_values or ()),
    }

    desired: set[str] = set()
    declared: set[str] = set()
    group_roles: dict[str, set[str]] = {}
    for rule in rules:
        declared.add(rule.group)
        group_roles.setdefault(rule.group, set()).update(rule.roles)
        if rule.match in asserted.get(rule.claim, set()):
            desired.add(rule.group)

    return RuleResolution(
        desired_groups=frozenset(desired),
        declared_groups=frozenset(declared),
        group_roles={group: frozenset(roles) for group, roles in group_roles.items()},
        groups_asserted=group_values is not None,
        roles_asserted=role_values is not None,
    )


def resolve_groups(values: Iterable[str], mapping: Mapping[str, str]) -> set[str]:
    """Map identity-provider group values onto Pulp group names."""

    return {mapping[value] for value in values if value in mapping}


def parse_role_spec(value: str) -> RoleSpec | None:
    """Parse ``role/domain/prn``; return None when the value is unusable."""

    parts = value.split("/")
    if len(parts) != 3:
        return None
    role, domain, prn = (part.strip() for part in parts)
    if not role:
        return None
    return RoleSpec(role=role, domain=domain, object_prn=prn)


def normalize_role_spec(value: RoleSpec | str) -> RoleSpec | None:
    if isinstance(value, RoleSpec):
        return value if value.role else None
    return parse_role_spec(value)


def resolve_roles(
    values: Iterable[str], mapping: Mapping[str, RoleSpec | str]
) -> set[RoleSpec]:
    """Map identity-provider role values onto Pulp role specs."""

    specs: set[RoleSpec] = set()
    for value in values:
        if value not in mapping:
            continue
        spec = normalize_role_spec(mapping[value])
        if spec is not None:
            specs.add(spec)
    return specs


def managed_role_keys(mapping: Mapping[str, RoleSpec | str]) -> set[str]:
    """Role keys that the identity provider owns and may therefore remove."""

    keys: set[str] = set()
    for value in mapping.values():
        spec = normalize_role_spec(value)
        if spec is not None:
            keys.add(str(spec))
    return keys


def decode_id_token_claims(token: str) -> dict[str, Any]:
    """Decode a JWT payload without verifying it.

    Social auth has already validated the token signature; this only reads the
    claims it carries so group/role sync can see them.
    """

    parts = token.split(".")
    if len(parts) != 3:
        return {}
    payload = parts[1]
    padded = payload + "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
        claims = json.loads(decoded.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return {}
    return claims if isinstance(claims, dict) else {}


def extract_claims(response: Mapping[str, Any]) -> dict[str, Any]:
    """Flatten a token response into a single claim mapping.

    Providers disagree about where they put the user payload: some return the
    claims at the top level, some nest them under ``user_data``, and OIDC
    backends usually hand back an encoded ``id_token``.
    """

    claims: dict[str, Any] = {}

    token = response.get("id_token")
    if isinstance(token, str):
        claims.update(decode_id_token_claims(token))

    for key in _USER_PAYLOAD_KEYS:
        payload = response.get(key)
        if isinstance(payload, Mapping):
            claims.update(payload)

    for key, value in response.items():
        if key in _USER_PAYLOAD_KEYS:
            continue
        claims[key] = value

    return claims
