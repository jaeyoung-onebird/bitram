from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str
    DATABASE_URL_SYNC: str

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Encryption
    ENCRYPTION_KEY: str

    # Upbit
    UPBIT_FEE_RATE: float = 0.0005
    PAPER_TRADING: bool = True  # True=모의매매, False=실매매

    # TossPayments
    TOSSPAYMENTS_CLIENT_KEY: str = ""
    TOSSPAYMENTS_SECRET_KEY: str = ""

    # AI (Claude)
    ANTHROPIC_API_KEY: str = ""
    # Use a stable, widely-available Haiku model name by default.
    ANTHROPIC_MODEL: str = "claude-3-haiku-20240307"
    # AI (OpenAI)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""

    # Twitter Bot
    TWITTER_API_KEY: str = ""
    TWITTER_API_SECRET: str = ""
    TWITTER_ACCESS_TOKEN: str = ""
    TWITTER_ACCESS_TOKEN_SECRET: str = ""
    TWITTER_BEARER_TOKEN: str = ""
    TWITTER_BOT_ENABLED: bool = False
    TWITTER_AUTH_TOKEN: str = ""  # 쿠키 auth_token (X 피드 스크래핑용)

    # Feeds (RSS/Atom)
    # Comma-separated URLs. Keep empty to disable.
    NEWS_FEED_URLS: str = ""
    X_FEED_URLS: str = ""
    X_FEED_USERNAMES: str = "whale_alert,WatcherGuru,CryptoQuant_com,100trillionUSD,VitalikButerin,caborakunCH,lookonchain,AltcoinGordon,BitcoinMagazine,coinaborasCH"
    FEED_TRANSLATION_PROVIDER: str = "claude"  # claude | openai
    FEED_OPENAI_MODEL: str = ""  # optional override for feed translation
    FEED_ANTHROPIC_MODEL: str = "claude-3-haiku-20240307"

    # Email (SMTP)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@bitram.co.kr"

    # Sentry
    SENTRY_DSN: str = ""

    # App
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: str = "http://localhost:3000"
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
