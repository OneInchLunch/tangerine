#!/usr/bin/env python3
"""Apply Tangerine's expected access policies through the Pulp ORM.

The gateway cannot create a missing Pulp access policy through the REST API:
the ``access_policies`` collection rejects ``POST``. This script runs inside the
Pulp pod instead and reads the policy map as JSON on stdin. Generate that map
from the gateway package and pipe it in:

    python3 -c 'import json; from tangerine_gateway.access_policies import \
EXPECTED_POLICIES; print(json.dumps(EXPECTED_POLICIES))' > /tmp/policies.json

    kubectl -n pulp exec -i deploy/pulp -c pulp -- \
        python3 /tmp/apply_pulp_access_policies.py --apply < /tmp/policies.json

Dry-run is the default. Existing records keep their creation hooks and queryset
scoping; only statements and the customized flag are updated.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pulpcore.app.settings")

import django  # noqa: E402

django.setup()

from pulpcore.app.models import AccessPolicy  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write missing or drifted policies (default is a dry run)",
    )
    args = parser.parse_args()

    try:
        policies = json.load(sys.stdin)
    except ValueError as exc:
        print(f"invalid policy JSON: {exc}", file=sys.stderr)
        return 2
    if not isinstance(policies, dict):
        print("policy JSON must be an object of viewset name to statements", file=sys.stderr)
        return 2

    failures = 0
    for name, statements in policies.items():
        record = AccessPolicy.objects.filter(viewset_name=name).first()
        if record is None:
            if not args.apply:
                print(f"{name}: missing (dry run: would create)")
                continue
            AccessPolicy.objects.create(
                viewset_name=name,
                statements=statements,
                customized=True,
            )
            print(f"{name}: created")
            continue
        if record.statements == statements:
            print(f"{name}: matches")
            continue
        if not args.apply:
            print(f"{name}: drifted (dry run: would update)")
            continue
        record.statements = statements
        record.customized = True
        record.save(update_fields=["statements", "customized"])
        print(f"{name}: updated")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
