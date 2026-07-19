"""Generate a Fernet key for encrypting secrets at rest (SECRETS_ENCRYPTION_KEY).

Usage (inside the container or venv):
    python app/scripts/generate_secret_key.py

Paste the printed line into your .env file, then restart the container.

To rotate later: generate a new key, put it FIRST, and keep the current one so
existing secrets still decrypt, e.g.:
    SECRETS_ENCRYPTION_KEY=<new-key>,<old-key>
Once every stored secret has been re-saved (re-encrypted with the new key),
you can drop the old key from the list.
"""
from cryptography.fernet import Fernet

key = Fernet.generate_key().decode()

print("# Add this line to your .env file:\n")
print(f"SECRETS_ENCRYPTION_KEY={key}")
