import base64
import json

import pytest

from tangerine_gateway.header import identity_header_value


def test_identity_header_is_base64_json_with_a_user_key():
    value = identity_header_value("alice")
    decoded = json.loads(base64.b64decode(value))
    assert decoded == {"user": "alice"}


def test_identity_header_round_trips_awkward_usernames():
    username = "alice.o'brien+ci@example.com"
    value = identity_header_value(username)
    assert json.loads(base64.b64decode(value))["user"] == username


def test_identity_header_rejects_empty_usernames():
    with pytest.raises(ValueError):
        identity_header_value("")
