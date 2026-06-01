"""Environment loading helpers for Trace Money backend."""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


def backend_dir() -> Path:
    return Path(__file__).resolve().parent


def load_backend_env() -> None:
    root = backend_dir().parent
    for env_path in (backend_dir() / ".env", root / ".env"):
        if env_path.exists():
            load_dotenv(env_path, override=False)
    local_env = root / ".env.local"
    if local_env.exists():
        load_dotenv(local_env, override=True)


def resolve_backend_path(value: str) -> str:
    candidate = Path(value).expanduser()
    if candidate.is_absolute():
        return str(candidate)
    return str((backend_dir() / candidate).resolve())
