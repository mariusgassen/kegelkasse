from pydantic import ConfigDict
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str
    ENVIRONMENT: str = "development"
    # Session length is split in two: the access token is what every request
    # carries and nothing can revoke it early, so it stays short; the refresh
    # token is a revocable database row and is what actually keeps a member
    # logged in between Kegelabende.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60          # 1 hour
    REFRESH_TOKEN_EXPIRE_DAYS: int = 365           # inactivity before re-login
    # Grace period in which re-presenting an already-rotated refresh token is
    # treated as a double-fired request from the same client (two tabs, a retry)
    # rather than as a stolen-token replay. Beyond it the whole login family is
    # revoked.
    REFRESH_REUSE_GRACE_SECONDS: int = 30
    FIRST_SUPERADMIN_EMAIL: str = "admin@kegelkasse.de"
    FIRST_SUPERADMIN_PASSWORD: str = "changeme123"
    # Web Push (VAPID) — optional; push disabled if not set
    VAPID_PRIVATE_KEY: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_CLAIM_EMAIL: str = "info@kc-eichhorn.de"
    # Public base URL of the app — used to build absolute links in emails (e.g. https://kegelkasse.example.com)
    APP_BASE_URL: str = ""
    # Seconds after server start before a new version is announced by push, so the
    # announcement only goes out once the new container is actually serving traffic.
    RELEASE_ANNOUNCE_DELAY_SECONDS: int = 120
    # Encryption key(s) for secrets at rest (e.g. per-club SMTP passwords).
    # Comma-separated list of Fernet keys — the first encrypts, all decrypt (for
    # rotation). Generate one with: python app/scripts/generate_secret_key.py
    # When empty, a key is derived from SECRET_KEY (so encryption still works
    # out of the box, but rotating SECRET_KEY would then invalidate secrets).
    SECRETS_ENCRYPTION_KEY: str = ""
    # Time zone in which members enter evening times. The app stores those wall-clock times in the
    # UTC slot of its timestamp columns (20:00 entered → 20:00+00:00); outputs that hand times to
    # other software (iCal feed, public schedule API) use this zone to turn them into real instants.
    CLUB_TIMEZONE: str = "Europe/Berlin"
    # Claude API (Anthropic) — optional; the AI features (recaps, suggestions, booking review)
    # are hidden when left empty. ANTHROPIC_MODEL overrides the default model.
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-opus-5-5"
    # Media storage (photos, logos, avatars). "local" = the uploads volume, "s3" = an
    # S3-compatible bucket such as Garage. Files are always served by the app at /uploads/<key>,
    # so stored URLs stay valid when switching. Credentials come from env only.
    MEDIA_STORAGE: str = "local"
    UPLOADS_DIR: str = "/app/uploads"
    MEDIA_S3_ENDPOINT_URL: str = ""          # e.g. http://garage:3900
    MEDIA_S3_REGION: str = "garage"          # Garage's default s3_region
    MEDIA_S3_BUCKET: str = ""
    MEDIA_S3_ACCESS_KEY_ID: str = ""
    MEDIA_S3_SECRET_ACCESS_KEY: str = ""
    MEDIA_S3_FORCE_PATH_STYLE: bool = True   # Garage needs path-style unless root_domain is set
    # Logging — configurable level for monitoring (DEBUG, INFO, WARNING, ERROR)
    LOG_LEVEL: str = "INFO"
    # pgbackrest — scheduled backup cron expression + management API URL
    BACKUP_SCHEDULE: str = "0 2 * * *"  # daily full backup at 02:00 UTC
    BACKUP_RETAIN_FULL: int = 7          # number of full backup sets to retain
    PGB_MGMT_URL: str = "http://db:8089"

    @property
    def sync_database_url(self) -> str:
        # SQLAlchemy 2.1 maps a bare ``postgresql://`` to psycopg 3; we ship psycopg2.
        return self.DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)


settings = Settings()
