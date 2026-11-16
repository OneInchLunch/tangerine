"""Expected read-only Pulp access policies for SSO administrators.

Repository-scoped admins carry ``tangerine-admin-read`` plus dynamic
``tangerine-repository-admin`` scopes. These statements let them read the user,
role, signing-service, task, worker, and import/export screens without granting
write access, which stays superuser-only.
"""

from __future__ import annotations

import json
from typing import Any

def _crud_policy(model: str, *, update: bool = True) -> list[dict[str, Any]]:
    statements: list[dict[str, Any]] = [
        {
            "action": ["list", "retrieve"],
            "effect": "allow",
            "condition": f"has_model_or_domain_perms:core.view_{model}",
            "principal": "authenticated",
        },
        {
            "action": ["create"],
            "effect": "allow",
            "condition": f"has_model_or_domain_perms:core.add_{model}",
            "principal": "authenticated",
        },
    ]
    if update:
        statements.append(
            {
                "action": ["update", "partial_update"],
                "effect": "allow",
                "condition": f"has_model_or_domain_perms:core.change_{model}",
                "principal": "authenticated",
            }
        )
    statements.append(
        {
            "action": ["destroy"],
            "effect": "allow",
            "condition": f"has_model_or_domain_perms:core.delete_{model}",
            "principal": "authenticated",
        }
    )
    return statements


EXPECTED_POLICIES: dict[str, list[dict[str, Any]]] = {
    "tasks": [
        {
            "action": ["list", "retrieve"],
            "effect": "allow",
            "condition": "has_model_or_domain_perms:core.view_task",
            "principal": "authenticated",
        }
    ],
    "users": [
        {
            "action": ["list", "retrieve"],
            "effect": "allow",
            "condition": "has_model_or_domain_perms:auth.view_user",
            "principal": "authenticated",
        },
        {
            "action": ["create", "update", "partial_update", "destroy"],
            "effect": "allow",
            "principal": "admin",
        },
    ],
    "roles": [
        {
            "action": ["list", "retrieve"],
            "effect": "allow",
            "condition": "has_model_or_domain_perms:core.view_role",
            "principal": "authenticated",
        },
        {
            "action": ["create", "update", "partial_update", "destroy"],
            "effect": "allow",
            "principal": "admin",
        },
    ],
    "signing-services": [
        {
            "action": ["list", "retrieve"],
            "effect": "allow",
            "condition": "has_model_or_domain_perms:core.view_signingservice",
            "principal": "authenticated",
        }
    ],
    "workers": [
        {
            "action": ["list", "retrieve"],
            "effect": "allow",
            "condition": "has_model_or_domain_perms:core.view_task",
            "principal": "authenticated",
        }
    ],
    "exporters/core/pulp": _crud_policy("pulpexporter"),
    "exporters/core/filesystem": _crud_policy("filesystemexporter"),
    "exporters/core/pulp/exports": _crud_policy("pulpexport", update=False),
    "exporters/core/filesystem/exports": _crud_policy(
        "filesystemexport", update=False
    ),
    "importers/core/pulp": _crud_policy("pulpimporter"),
    "importers/core/pulp/imports": _crud_policy("pulpimport", update=False),
}


def policy_matches(
    statements: list[dict[str, Any]] | None, expected: list[dict[str, Any]]
) -> bool:
    """Compare statements without depending on key order."""

    return json.dumps(statements or [], sort_keys=True) == json.dumps(
        expected, sort_keys=True
    )
