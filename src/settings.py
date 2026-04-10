import os
from dataclasses import dataclass
from typing import List


def _as_bool(raw: str, default: bool) -> bool:
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    return default


def _as_int(raw: str, default: int) -> int:
    if raw is None:
        return default
    try:
        parsed = int(raw)
        return parsed if parsed > 0 else default
    except ValueError:
        return default


def _as_list(raw: str) -> List[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    environment: str
    is_hf_space: bool
    cors_allow_origins: List[str]
    cors_allow_credentials: bool
    trusted_hosts: List[str]
    max_active_envs: int

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


_DEFAULT_DEV_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:8011",
    "http://localhost:8011",
]


def load_settings() -> Settings:
    environment = os.getenv("APP_ENV", "development").strip().lower() or "development"
    space_id = os.getenv("SPACE_ID", "").strip()
    space_host = os.getenv("SPACE_HOST", "").strip().lower()
    is_hf_space = bool(space_id)

    configured_origins = _as_list(os.getenv("ALLOW_ORIGINS"))
    if configured_origins:
        cors_allow_origins = configured_origins
    elif environment == "production":
        cors_allow_origins = []
    else:
        cors_allow_origins = _DEFAULT_DEV_ORIGINS

    allow_credentials_default = environment != "production"
    cors_allow_credentials = _as_bool(os.getenv("ALLOW_CREDENTIALS"), allow_credentials_default)

    # Browsers reject wildcard origins when credentials are enabled.
    if "*" in cors_allow_origins:
        cors_allow_credentials = False

    trusted_hosts = _as_list(os.getenv("TRUSTED_HOSTS"))
    if not trusted_hosts:
        # Proxy/CDN layers may rewrite Host unexpectedly; keep permissive default
        # unless TRUSTED_HOSTS is explicitly provided.
        trusted_hosts = ["*"]

    max_active_envs = _as_int(os.getenv("MAX_ACTIVE_ENVS"), 128)

    return Settings(
        environment=environment,
        is_hf_space=is_hf_space,
        cors_allow_origins=cors_allow_origins,
        cors_allow_credentials=cors_allow_credentials,
        trusted_hosts=trusted_hosts,
        max_active_envs=max_active_envs,
    )


settings = load_settings()
