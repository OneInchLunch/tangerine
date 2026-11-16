from cryptography.fernet import Fernet

from tangerine_gateway.token_crypto import TokenCipher


def _key() -> str:
    return Fernet.generate_key().decode()


def test_round_trip():
    cipher = TokenCipher(_key())
    encrypted = cipher.encrypt("id-token-value")
    assert encrypted is not None
    assert encrypted.startswith("v1:")
    assert "id-token-value" not in encrypted
    assert cipher.decrypt(encrypted) == "id-token-value"


def test_missing_key_never_stores_the_token():
    cipher = TokenCipher(None)
    assert cipher.enabled is False
    assert cipher.encrypt("id-token-value") is None
    assert cipher.decrypt("v1:anything") is None


def test_wrong_key_and_tampering_degrade_to_none():
    encrypted = TokenCipher(_key()).encrypt("id-token-value")
    assert encrypted is not None
    assert TokenCipher(_key()).decrypt(encrypted) is None
    assert TokenCipher(_key()).decrypt(encrypted[:-2] + "xx") is None
    assert TokenCipher(_key()).decrypt("plain-token") is None


def test_empty_values_are_ignored():
    cipher = TokenCipher(_key())
    assert cipher.encrypt(None) is None
    assert cipher.encrypt("") is None
    assert cipher.decrypt(None) is None
    assert cipher.decrypt("") is None
