"""Runtime settings, all overridable by environment variable."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, ""))
    except ValueError:
        return default


def _default_cache_dir() -> Path:
    return Path(os.getenv("NABRA_CLIP_DIR") or Path.home() / ".cache" / "nabra-tts" / "clips")


@dataclass(frozen=True)
class Settings:
    # Model
    repo_id: str = os.getenv("NABRA_REPO_ID", "oddadmix/Nabra-7M-Distill")
    revision: str | None = os.getenv("NABRA_REVISION") or None
    device: str | None = os.getenv("NABRA_DEVICE") or None          # None -> auto
    torch_threads: int = _env_int("NABRA_TORCH_THREADS", 4)
    preload: bool = _env_bool("NABRA_PRELOAD", True)
    diacritize: bool = _env_bool("NABRA_DIACRITIZE", True)

    # Synthesis limits
    max_chars: int = _env_int("NABRA_MAX_CHARS", 3000)
    min_speed: float = 0.5
    max_speed: float = 2.0
    max_concurrency: int = _env_int("NABRA_MAX_CONCURRENCY", 2)

    # Generated clip store
    clip_dir: Path = field(default_factory=_default_cache_dir)
    clip_ttl_seconds: int = _env_int("NABRA_CLIP_TTL", 60 * 60)     # 1 hour
    max_clips: int = _env_int("NABRA_MAX_CLIPS", 200)

    # HTTP
    cors_origins: tuple[str, ...] = tuple(
        o.strip()
        for o in os.getenv(
            "NABRA_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if o.strip()
    )
    # Optional: serve a built frontend (frontend/dist) from the same process.
    frontend_dist: Path | None = field(
        default_factory=lambda: (
            Path(os.environ["NABRA_FRONTEND_DIST"]).resolve()
            if os.getenv("NABRA_FRONTEND_DIST")
            else (Path(__file__).resolve().parents[2] / "frontend" / "dist")
        )
    )


settings = Settings()
