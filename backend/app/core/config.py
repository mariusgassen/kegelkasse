from pydantic import ConfigDict
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str
    ENVIRONMENT: str = "development"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    FIRST_SUPERADMIN_EMAIL: str = "admin@kegelkasse.de"
    FIRST_SUPERADMIN_PASSWORD: str = "changeme123"
    # Web Push (VAPID) — optional; push disabled if not set
    VAPID_PRIVATE_KEY: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_CLAIM_EMAIL: str = "info@kc-eichhorn.de"
    # Public base URL of the app — used to build absolute links in emails (e.g. https://kegelkasse.example.com)
    APP_BASE_URL: str = ""
    # Encryption key(s) for secrets at rest (e.g. per-club SMTP passwords).
    # Comma-separated list of Fernet keys — the first encrypts, all decrypt (for
    # rotation). Generate one with: python app/scripts/generate_secret_key.py
    # When empty, a key is derived from SECRET_KEY (so encryption still works
    # out of the box, but rotating SECRET_KEY would then invalidate secrets).
    SECRETS_ENCRYPTION_KEY: str = ""
    # Logging — configurable level for monitoring (DEBUG, INFO, WARNING, ERROR)
    LOG_LEVEL: str = "INFO"
    # pgbackrest — scheduled backup cron expression + management API URL
    BACKUP_SCHEDULE: str = "0 2 * * *"  # daily full backup at 02:00 UTC
    BACKUP_RETAIN_FULL: int = 7          # number of full backup sets to retain
    PGB_MGMT_URL: str = "http://db:8089"

settings = Settings()
