#!/bin/sh
# Build a CA bundle for local development on macOS.
#
# Why this exists: on a network that intercepts TLS (common on corporate wifi), the intercepting
# root CA lives in the macOS keychain but is NOT in /etc/ssl/cert.pem. Node only trusts what it is
# given, so outbound HTTPS from the dev server fails with UNABLE_TO_GET_ISSUER_CERT_LOCALLY --
# which surfaces in the app as "Summary unavailable", because the NVIDIA API call never connects.
# curl works in the same shell, which makes this look like an app bug rather than a trust-store one.
#
# Exporting the keychain roots gives Node the same trust store the rest of the system uses.
# Output is a *.pem file, already covered by .gitignore, and is regenerated on every `npm run dev`.

set -e

OUT="$(cd "$(dirname "$0")/.." && pwd)/certs/local-ca.pem"
mkdir -p "$(dirname "$OUT")"

: > "$OUT"
security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain >> "$OUT" 2>/dev/null || true
security find-certificate -a -p /Library/Keychains/System.keychain >> "$OUT" 2>/dev/null || true

COUNT=$(grep -c "BEGIN CERTIFICATE" "$OUT" || echo 0)
if [ "$COUNT" -eq 0 ]; then
  echo "warning: no certificates exported; falling back to Node's built-in trust store" >&2
  rm -f "$OUT"
  exit 0
fi

echo "local CA bundle: $COUNT certificates -> $OUT"
