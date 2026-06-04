# Sync controlKeywords in step-runner-agent-keywords.json from live Quicker catalog.
# Requires: Quicker + QuickerRpc plugin, qkrpc on PATH.
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KEYWORDS_PATH = ROOT / "QuickerRpc.AgentModel" / "Catalog" / "step-runner-agent-keywords.json"

# Extra curated aliases per module (value -> extra keywords beyond auto from selection name).
CURATED: dict[str, dict[str, list[str]]] = {
    "sys:fileOperation": {
        "copyInto": ["copy to folder", "复制到", "复制文件到"],
        "moveInto": ["move to folder", "移动文件", "移动文件到", "移动到"],
        "deleteFile": ["delete file", "删除文件"],
        "copyFile": ["copy file auto", "复制文件"],
        "moveFile": ["move file auto", "deprecated move file"],
        "rename": ["rename file", "重命名", "移动重命名"],
        "recycleNoUi": ["recycle bin silent", "回收站安静"],
        "enumFiles": ["list files", "枚举文件", "列出文件"],
    },
    "sys:mouse": {
        "click": ["mouse click", "click", "单击", "鼠标点击"],
        "dbclick": ["double click", "双击"],
        "move": ["mouse move distance", "移动距离"],
        "moveTo": ["move mouse to", "移动鼠标到"],
        "scroll": ["mouse wheel", "滚轮", "滚动"],
        "restore": ["restore cursor", "还原鼠标"],
    },
    "sys:windowOperations": {
        "move": ["move window", "移动窗口", "移动"],
        "move_ex": ["move window enhanced", "移动窗口增强", "移动窗口(增强)"],
    },
    "sys:runScript": {
        "PS": ["powershell", "ps1", "pwsh"],
        "CMD_C": ["cmd", "command prompt"],
        "CMD_K": ["cmd keep open"],
        "BAT": ["batch", "bat file"],
    },
    "sys:listOperations": {
        "append": ["add to list", "append", "添加", "添加元素"],
        "insertAt": ["insert list", "插入"],
        "remove": ["remove from list", "删除元素"],
        "getAt": ["get list item", "获取元素"],
    },
    "sys:dictOperations": {
        "get": ["dict get", "读取词典", "获取键值"],
        "set": ["dict set", "设置词典"],
        "remove": ["dict remove", "删除键"],
    },
    "sys:strReplace": {
        "single": ["replace once", "单次替换"],
        "regex": ["regex replace", "正则替换"],
    },
}


def camel_to_words(value: str) -> str | None:
    if not value or value.isupper():
        return None
    spaced = re.sub(r"([a-z])([A-Z])", r"\1 \2", value)
    if spaced != value and " " in spaced:
        return spaced.lower()
    return None


def seed_keywords(name: str, value: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def add(text: str) -> None:
        t = text.strip()
        if not t:
            return
        key = t.casefold()
        if key in seen:
            return
        seen.add(key)
        out.append(t)

    add(name)
    add(value)
    eng = camel_to_words(value)
    if eng:
        add(eng)
    for part in re.split(r"[/（(【\s]+", name):
        part = part.strip(" ）)】")
        if len(part) >= 2:
            add(part)
    return out


def qkrpc_get(key: str) -> dict | None:
    proc = subprocess.run(
        ["qkrpc", "step-runner", "get", "--key", key, "--json"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        print(f"skip {key}: qkrpc failed", file=sys.stderr)
        return None
    try:
        root = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        print(f"skip {key}: json error {exc}", file=sys.stderr)
        return None
    payload = root.get("payload") or {}
    if not payload.get("success"):
        return None
    return payload.get("schema") or {}


def merge_control_keywords(entry: dict, key: str, schema: dict) -> bool:
    control = schema.get("controlField") or {}
    selection = control.get("selection") or []
    if not selection:
        return False

    curated = CURATED.get(key, {})
    existing = entry.get("controlKeywords") or {}
    merged: dict[str, list[str]] = {}
    changed = False

    for item in selection:
        value = (item.get("key") or "").strip()
        name = (item.get("name") or "").strip()
        if not value:
            continue
        auto = seed_keywords(name, value)
        extra = curated.get(value, [])
        combined: list[str] = []
        seen: set[str] = set()
        for kw in auto + extra + (existing.get(value) or []):
            k = (kw or "").strip()
            if not k:
                continue
            fold = k.casefold()
            if fold in seen:
                continue
            seen.add(fold)
            combined.append(k)
        if combined:
            merged[value] = combined
        if existing.get(value) != combined:
            changed = True

    if merged:
        entry["controlKeywords"] = merged
        return changed
    return False


def main() -> None:
    data = json.loads(KEYWORDS_PATH.read_text(encoding="utf-8"))
    updated = 0
    with_control = 0
    for key in data:
        schema = qkrpc_get(key)
        if not schema:
            continue
        if schema.get("controlField"):
            with_control += 1
        if merge_control_keywords(data[key], key, schema):
            updated += 1
            print(f"updated {key}")

    KEYWORDS_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Done: {with_control} modules with controlField, {updated} entries updated.")


if __name__ == "__main__":
    main()
