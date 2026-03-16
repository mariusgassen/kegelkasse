"""Generate VAPID key pair for Web Push notifications.

Usage (inside the container or venv):
    python app/scripts/generate_vapid.py

Paste the two printed lines into your .env file, then restart the container.
"""
import base64

from py_vapid import Vapid

v = Vapid()
v.generate_keys()

# Private key: PEM with literal \n so it fits on one env line
private_pem: str = v.private_pem().decode().strip()
private_oneline = private_pem.replace("\n", "\\n")

# Public key: base64url-encoded uncompressed EC point (what the browser needs)
raw_public: bytes = v.public_key.public_bytes(
    __import__("cryptography").hazmat.primitives.serialization.Encoding.X962,
    __import__("cryptography").hazmat.primitives.serialization.PublicFormat.UncompressedPoint,
)
public_b64 = base64.urlsafe_b64encode(raw_public).rstrip(b"=").decode()

print("# Add these lines to your .env file:\n")
print(f"VAPID_PRIVATE_KEY={private_oneline}")
print(f"VAPID_PUBLIC_KEY={public_b64}")
