"""Environment loading helpers for Trace Money backend."""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


def backend_dir() -> Path:
    return Path(__file__).resolve().parent


def load_backend_env() -> None:
    env_paths = [
        backend_dir() / ".env",
        backend_dir().parent / ".env",
    ]
    for env_path in env_paths:
        if env_path.exists():
            load_dotenv(env_path, override=False)


def resolve_backend_path(value: str) -> str:
    candidate = Path(value).expanduser()
    if candidate.is_absolute():
        return str(candidate)
    return str((backend_dir() / candidate).resolve())
