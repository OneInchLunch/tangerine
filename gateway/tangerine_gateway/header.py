"""Build the identity header Pulp reads.

Pulp's ``JSONHeaderRemoteAuthentication`` base64-decodes the header value and
applies a JQ filter (``.user``) to extract the username. There is no signature:
trust rests on the edge stripping inbound copies of this header and on network
isolation. See the deployment docs before changing this format.
"""

from __future__ import annotations

import base64
import json

HEADER_NAME = "X-Tangerine-Identity"


def identity_header_value(username: str) -> str:
    """Encode the username the way Pulp expects."""

    if not username:
        raise ValueError("username must not be empty")
    payload = json.dumps({"user": username}, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(payload).decode("ascii")
