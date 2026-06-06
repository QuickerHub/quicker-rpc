from __future__ import annotations

import asyncio
import logging

from quicker_browser_runtime.config import RuntimeConfig, configure_logging, load_config
from quicker_browser_runtime.server import run_server
from quicker_browser_runtime.session_manager import SessionManager

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> None:
    config = load_config(argv)
    configure_logging(config.log_level)
    manager = SessionManager(config)
    try:
        asyncio.run(run_server(config, manager))
    except KeyboardInterrupt:
        logger.info("Shutting down")
    finally:
        try:
            asyncio.run(manager.shutdown())
        except RuntimeError:
            pass


if __name__ == "__main__":
    main()
