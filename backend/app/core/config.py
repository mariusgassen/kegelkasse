from pydantic_settings import BaseSettings

class Settings(BaseSettings):
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
    # Database backups
    BACKUP_DIR: str = "/backups"
    BACKUP_SCHEDULE: str = "0 2 * * *"  # daily at 02:00 UTC
    BACKUP_RETAIN_DAYS: int = 7
    # S3-compatible storage — leave S3_BUCKET empty to disable
    S3_BUCKET: str = ""
    S3_PREFIX: str = "kegelkasse/backups"
    S3_ENDPOINT_URL: str = ""
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_DEFAULT_REGION: str = "us-east-1"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
