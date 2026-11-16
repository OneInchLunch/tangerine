#!/usr/bin/env bash
#
# RPM repository-metadata signing for Pulp Operator.
#
# Pulp calls this script with the repomd.xml path and expects a JSON result on
# stdout. The operator imports the armored key into $HOME/.gnupg (HOME is
# /var/lib/pulp) through an init container; when the key is also mounted at
# /etc/pulp/keys/signing_service.gpg, prefer a temporary keyring so the key is
# not left behind after signing.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <file-to-sign>" >&2
  exit 2
fi

FILE_PATH=$1
SIGNATURE_PATH="${FILE_PATH}.asc"
KEY_PATH="/etc/pulp/keys/signing_service.gpg"
FINGERPRINT="${PULP_SIGNING_KEY_FINGERPRINT:-}"

if [ -z "$FINGERPRINT" ]; then
  echo "PULP_SIGNING_KEY_FINGERPRINT is not set" >&2
  exit 3
fi

TEMP_GNUPGHOME=""
cleanup() {
  if [ -n "$TEMP_GNUPGHOME" ]; then
    gpgconf --homedir "$TEMP_GNUPGHOME" --kill all >/dev/null 2>&1 || true
    rm -rf "$TEMP_GNUPGHOME"
  fi
}
trap cleanup EXIT

if [ -r "$KEY_PATH" ]; then
  TEMP_GNUPGHOME="$(mktemp -d)"
  export GNUPGHOME="$TEMP_GNUPGHOME"
  chmod 700 "$GNUPGHOME"
  gpg --batch --quiet --import "$KEY_PATH"
else
  # The operator's gpg-config init container imported the key into this home.
  gpg --batch --list-secret-keys "$FINGERPRINT" >/dev/null 2>&1 || {
    echo "signing key $FINGERPRINT is not available in the Pulp keyring" >&2
    exit 4
  }
fi

gpg --batch --yes --quiet \
  --local-user "$FINGERPRINT" \
  --armor --detach-sign \
  --output "$SIGNATURE_PATH" \
  "$FILE_PATH"

if [ ! -s "$SIGNATURE_PATH" ]; then
  echo "signature was not written" >&2
  exit 5
fi

python3 - "$FILE_PATH" "$SIGNATURE_PATH" <<'PY'
import json
import sys

print(json.dumps({"file": sys.argv[1], "signature": sys.argv[2]}))
PY
