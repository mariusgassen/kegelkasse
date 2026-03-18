from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings
from typing import List
import os

print(os.getenv("CORS_ALLOW_ORIGIN"))

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
    CORS_ALLOW_ORIGIN: List[string] = ["https://kegelkasse.mariusgassen.com", "https://kasse.kc-eichhorn.de"]
    
    class Config:
        env_file = ".env"
        
settings = Settings()
