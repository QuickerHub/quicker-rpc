from __future__ import annotations

import os
from pathlib import Path


def default_user_data_dir() -> Path:
    override = os.environ.get("QUICKER_BROWSER_USER_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    local = os.environ.get("LOCALAPPDATA", "").strip()
    if local:
        return Path(local) / "QuickerAgent" / "browser-profile"
    return Path.home() / ".local" / "share" / "QuickerAgent" / "browser-profile"
