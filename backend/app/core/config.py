from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ENVIRONMENT: str = "development"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    FIRST_SUPERADMIN_EMAIL: str = "admin@kegelkasse.de"
    FIRST_SUPERADMIN_PASSWORD: str = "changeme123"

    class Config:
        env_file = ".env"


settings = Settings()
