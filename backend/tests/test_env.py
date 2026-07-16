from __future__ import annotations

import os
from pathlib import Path

from backend import env


def test_load_backend_env_preserves_process_env_and_prefers_local_file(
    monkeypatch,
    tmp_path: Path,
) -> None:
    backend_dir = tmp_path / "backend"
    backend_dir.mkdir()
    (tmp_path / ".env.local").write_text(
        "EXISTING_KEY=empty-local-placeholder\nLOCAL_FIRST=from-local\n",
        encoding="utf-8",
    )
    (tmp_path / ".env").write_text(
        "LOCAL_FIRST=from-root\nROOT_ONLY=from-root\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(env, "backend_dir", lambda: backend_dir)
    monkeypatch.setenv("EXISTING_KEY", "from-systemd")
    monkeypatch.delenv("LOCAL_FIRST", raising=False)
    monkeypatch.delenv("ROOT_ONLY", raising=False)

    env.load_backend_env()

    assert os.getenv("EXISTING_KEY") == "from-systemd"
    assert os.getenv("LOCAL_FIRST") == "from-local"
    assert os.getenv("ROOT_ONLY") == "from-root"
