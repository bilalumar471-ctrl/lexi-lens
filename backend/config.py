"""
LexiLens — Configuration & Infrastructure Setup.

- Loads settings from environment variables.
- Fetches secrets from Google Secret Manager.
- Configures structured Cloud Logging (no PII).
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache

from pydantic_settings import BaseSettings


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class Settings(BaseSettings):
    """Application-wide settings, populated from env vars."""

    PROJECT_ID: str = os.getenv("PROJECT_ID", "lexi-lens")
    ENV: str = os.getenv("ENV", "development")
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]
    GEMINI_MODEL: str = "gemini-2.0-flash-live-001"
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()


# ---------------------------------------------------------------------------
# Google Secret Manager
# ---------------------------------------------------------------------------

def get_secret(secret_id: str, version: str = "latest") -> str:
    """
    Fetch a secret value from Google Secret Manager.

    Args:
        secret_id: The secret's ID in Secret Manager.
        version:   Version string (default ``"latest"``).

    Returns:
        The decoded secret payload.
    """
    from google.cloud import secretmanager

    settings = get_settings()
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{settings.PROJECT_ID}/secrets/{secret_id}/versions/{version}"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("utf-8")


# ---------------------------------------------------------------------------
# Cloud Logging
# ---------------------------------------------------------------------------

class _PIIFilter(logging.Filter):
    """Strip fields that could leak personally-identifiable information."""

    _PII_KEYS = {"email", "name", "phone", "address", "ssn", "password", "token"}

    def filter(self, record: logging.LogRecord) -> bool:
        # Scrub any extra dict attached to the record
        if hasattr(record, "extra") and isinstance(record.extra, dict):
            for key in list(record.extra.keys()):
                if key.lower() in self._PII_KEYS:
                    record.extra[key] = "***REDACTED***"
        return True


def setup_logging() -> None:
    """
    Configure structured JSON logging via Google Cloud Logging.

    In local/development mode, falls back to a standard stream handler
    so logs still appear in the terminal.
    """
    settings = get_settings()
    logger = logging.getLogger()
    logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))

    # Always add the PII filter
    pii_filter = _PIIFilter()

    if settings.ENV == "development":
        # Local: pretty-print to stdout
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        handler.addFilter(pii_filter)
        logger.addHandler(handler)
    else:
        # Cloud Run / production: structured JSON via Cloud Logging
        import google.cloud.logging as cloud_logging

        client = cloud_logging.Client(project=settings.PROJECT_ID)
        client.setup_logging(log_level=getattr(logging, settings.LOG_LEVEL.upper()))
        for h in logger.handlers:
            h.addFilter(pii_filter)

    logger.info(
        "Logging initialised",
        extra={"env": settings.ENV, "project": settings.PROJECT_ID},
    )
