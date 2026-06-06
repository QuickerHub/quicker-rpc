from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RefTarget:
    role: str
    name: str | None
    nth: int


def format_snapshot_yaml(
    url: str,
    title: str,
    ref_map: dict[str, RefTarget],
) -> str:
    lines = [
        f"url: {url}",
        f"title: {title}",
        "nodes:",
    ]
    for ref, target in ref_map.items():
        indent = "  "
        name_part = f' name="{target.name}"' if target.name else ""
        nth_part = f" nth={target.nth}" if target.nth > 0 else ""
        lines.append(
            f"{indent}- role={target.role}{name_part} ref={ref}{nth_part}",
        )
    return "\n".join(lines)


def parse_ref(ref: str) -> str:
    value = ref.strip()
    if not value:
        raise ValueError("ref is required")
    return value


def invoke_error(message: str, *, code: str = "error") -> dict[str, Any]:
    return {"ok": False, "error": code, "message": message}


def invoke_ok(data: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"ok": True}
    if data is not None:
        payload["data"] = data
    return payload
