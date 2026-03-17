"""Generate VAPID key pair for Web Push notifications.

Usage (inside the container or venv):
    python app/scripts/generate_vapid.py

Paste the two printed lines into your .env file, then restart the container.

The private key is exported as raw base64url (the 32-byte EC scalar 'd') —
no PEM headers, no newlines — which avoids all ASN.1 / line-wrap issues.
"""
import base64

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from py_vapid import Vapid

v = Vapid()
v.generate_keys()

# Private key: raw 32-byte EC scalar, base64url-encoded, no PEM, no newlines
d = v.private_key.private_numbers().private_value
raw_private: bytes = d.to_bytes(32, "big")
private_b64 = base64.urlsafe_b64encode(raw_private).rstrip(b"=").decode()

# Public key: base64url-encoded uncompressed EC point (what the browser needs)
raw_public: bytes = v.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
public_b64 = base64.urlsafe_b64encode(raw_public).rstrip(b"=").decode()

print("# Add these lines to your .env file:\n")
print(f"VAPID_PRIVATE_KEY={private_b64}")
print(f"VAPID_PUBLIC_KEY={public_b64}")
