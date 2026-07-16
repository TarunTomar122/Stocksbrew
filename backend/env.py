"""Environment loading helpers for Trace Money backend."""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


def backend_dir() -> Path:
    return Path(__file__).resolve().parent


def load_backend_env() -> None:
    root = backend_dir().parent
    # Load the most specific file first while preserving values supplied by the
    # process (systemd, Cloud Run, CI).  Using override=True for .env.local used
    # to let an empty local placeholder erase production secrets.
    for env_path in (root / ".env.local", backend_dir() / ".env", root / ".env"):
        if env_path.exists():
            load_dotenv(env_path, override=False)


def resolve_backend_path(value: str) -> str:
    candidate = Path(value).expanduser()
    if candidate.is_absolute():
        return str(candidate)
    return str((backend_dir() / candidate).resolve())
