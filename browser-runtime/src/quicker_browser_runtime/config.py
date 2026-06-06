from __future__ import annotations

import argparse
import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from quicker_browser_runtime.paths import default_user_data_dir


@dataclass(frozen=True)
class RuntimeConfig:
    host: str
    port: int
    headless: bool
    channel: str | None
    user_data_dir: Path
    log_level: str

    @property
    def runtime_version(self) -> str:
        from quicker_browser_runtime import __version__

        return __version__


def _default_channel() -> str | None:
    explicit = os.environ.get("QUICKER_BROWSER_CHANNEL", "").strip()
    if explicit:
        return explicit if explicit.lower() != "chromium" else None
    if sys.platform == "win32":
        return "msedge"
    return None


def load_config(argv: list[str] | None = None) -> RuntimeConfig:
    parser = argparse.ArgumentParser(
        prog="quicker-browser-runtime",
        description="QuickerAgent Playwright browser server",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("QUICKER_BROWSER_HOST", "127.0.0.1"),
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("QUICKER_BROWSER_PORT", "6017")),
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        default=os.environ.get("QUICKER_BROWSER_HEADLESS", "1") == "1",
    )
    parser.add_argument(
        "--channel",
        default=os.environ.get("QUICKER_BROWSER_CHANNEL"),
        help="Playwright browser channel (msedge, chrome, chromium)",
    )
    parser.add_argument(
        "--user-data-dir",
        default=os.environ.get("QUICKER_BROWSER_USER_DATA_DIR"),
    )
    parser.add_argument(
        "--log-level",
        default=os.environ.get("QUICKER_BROWSER_LOG_LEVEL", "INFO"),
    )
    args = parser.parse_args(argv)

    user_data = (
        Path(args.user_data_dir).expanduser().resolve()
        if args.user_data_dir
        else default_user_data_dir()
    )
    channel_raw = str(args.channel).strip() if args.channel else None
    channel = channel_raw if channel_raw else _default_channel()

    return RuntimeConfig(
        host=str(args.host),
        port=int(args.port),
        headless=bool(args.headless),
        channel=channel,
        user_data_dir=user_data,
        log_level=str(args.log_level).upper(),
    )


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
