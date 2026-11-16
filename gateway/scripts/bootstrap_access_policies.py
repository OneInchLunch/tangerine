#!/usr/bin/env python3
"""Apply the read-only Pulp access policies used by SSO administrators.

Dry-run by default; pass ``--apply`` to write. Reads the gateway's Pulp service
account from the environment so it can also run inside the gateway pod:

    kubectl -n pulp exec deploy/tangerine-gateway -- \
        python scripts/bootstrap_access_policies.py --apply

Only the ``users``, ``roles``, ``tasks``, ``signing-services``, ``workers``, and
import/export policies are touched. Write access to users and roles stays
superuser-only.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tangerine_gateway.access_policies import EXPECTED_POLICIES, policy_matches  # noqa: E402


def _policies(client: httpx.Client) -> dict[str, dict]:
    """Return the wanted policies by viewset name.

    Newer Pulp releases filter by ``viewset_name``; older ones ignore the filter
    and omit the field from the list, so fall back to detail reads.
    """

    wanted = list(EXPECTED_POLICIES)
    found: dict[str, dict] = {}
    for name in wanted:
        response = client.get(
            "/pulp/api/v3/access_policies/", params={"viewset_name": name}
        )
        response.raise_for_status()
        results = (response.json() or {}).get("results") or []
        if results:
            found[name] = results[0]

    remaining = [name for name in wanted if name not in found]
    if not remaining:
        return found

    url: str | None = "/pulp/api/v3/access_policies/"
    while url:
        response = client.get(url, params={"limit": 300} if url.startswith("/") else None)
        response.raise_for_status()
        payload = response.json() or {}
        for summary in payload.get("results") or []:
            href = summary.get("pulp_href")
            if not href:
                continue
            detail = client.get(href)
            detail.raise_for_status()
            record = detail.json() or {}
            name = record.get("viewset_name")
            if name in remaining:
                found[name] = record
        url = payload.get("next")
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pulp-url",
        default=os.environ.get("TANGERINE_PULP_URL", "http://localhost:8080"),
    )
    parser.add_argument("--user", default=os.environ.get("TANGERINE_PULP_USER", "admin"))
    parser.add_argument("--password", default=os.environ.get("TANGERINE_PULP_PASSWORD"))
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write the statements (default is a dry run)",
    )
    parser.add_argument("--insecure", action="store_true", help="skip TLS verification")
    args = parser.parse_args()

    if not args.password:
        print(
            "Pulp password is required (--password or TANGERINE_PULP_PASSWORD)",
            file=sys.stderr,
        )
        return 2

    failures = 0
    try:
        with httpx.Client(
            base_url=args.pulp_url.rstrip("/"),
            auth=(args.user, args.password),
            verify=not args.insecure,
            timeout=30,
            headers={"Accept": "application/json"},
        ) as client:
            try:
                records = _policies(client)
            except httpx.HTTPError as exc:
                print(f"Pulp policy lookup failed: {exc}", file=sys.stderr)
                return 2
            for name, expected in EXPECTED_POLICIES.items():
                record = records.get(name)
                if record is None:
                    print(
                        f"{name}: MISSING "
                        "(create with gateway/scripts/apply_pulp_access_policies.py --apply)"
                    )
                    failures += 1
                    continue
                matches = policy_matches(record.get("statements"), expected)
                print(
                    f"{name}: {'matches' if matches else 'drifted'} "
                    f"(customized={record.get('customized')})"
                )
                if matches:
                    continue
                if not args.apply:
                    print("  dry run: would replace the statements with the read-only policy")
                    continue
                response = client.patch(
                    record["pulp_href"], json={"statements": expected}
                )
                if response.status_code >= 400:
                    print(
                        f"  apply failed: {response.status_code} {response.text[:200]}",
                        file=sys.stderr,
                    )
                    failures += 1
                else:
                    print("  applied")
    except httpx.HTTPError as exc:
        print(f"Pulp is unreachable: {exc}", file=sys.stderr)
        return 2

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
