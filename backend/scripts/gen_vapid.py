"""
Generate VAPID keys for Web Push notifications.

Usage (inside Docker):
  docker compose exec app python scripts/gen_vapid.py

Then add the output to your .env file.
"""
import base64

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.backends import default_backend


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
private_bytes = private_key.private_numbers().private_value.to_bytes(32, 'big')

pub = private_key.public_key().public_numbers()
public_bytes = bytes([0x04]) + pub.x.to_bytes(32, 'big') + pub.y.to_bytes(32, 'big')

print("# Add these to your .env file:")
print(f"VAPID_PRIVATE_KEY={b64u(private_bytes)}")
print(f"VAPID_PUBLIC_KEY={b64u(public_bytes)}")
print("VAPID_CLAIM_EMAIL=admin@kegelkasse.de")
