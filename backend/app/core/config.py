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
    # Logging — configurable level for monitoring (DEBUG, INFO, WARNING, ERROR)
    LOG_LEVEL: str = "INFO"
    # pgbackrest — scheduled backup cron expression + management API URL
    BACKUP_SCHEDULE: str = "0 2 * * *"  # daily full backup at 02:00 UTC
    BACKUP_RETAIN_FULL: int = 7          # number of full backup sets to retain
    PGB_MGMT_URL: str = "http://db:8089"

settings = Settings()
