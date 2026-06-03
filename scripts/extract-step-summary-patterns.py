#!/usr/bin/env python3
"""Extract [StepSummary(...)] templates from Quicker StepRunnerV2 Definition.cs files."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_QUICKER_BUILDIN = (
    ROOT.parent
    / "quickerorg"
    / "Quicker"
    / "QuickerPc"
    / "Quicker"
    / "Actions"
    / "XActions"
    / "BuildinRunners"
)
DEFAULT_OUT = (
    ROOT
    / "agent-gui"
    / "lib"
    / "action-editor"
    / "steps"
    / "step-runner-summary-patterns.json"
)
MANUAL_OUT = (
    ROOT
    / "agent-gui"
    / "lib"
    / "action-editor"
    / "steps"
    / "step-runner-summary-patterns-manual.json"
)

STEP_KEY_RE = re.compile(r'\[Step\s*\([\s\S]*?Key\s*=\s*"([^"]+)"', re.MULTILINE)
STEP_SUMMARY_RE = re.compile(r"\[StepSummary\(([^\]]+)\)\]", re.MULTILINE)
NAMEOF_RE = re.compile(r"nameof\s*\(\s*Params\.(\w+)\s*\)")
STRING_LITERAL_RE = re.compile(r'"((?:\\.|[^"\\])*)"')
PARAM_BLOCK_RE = re.compile(
    r"\[(?:InputParam|OutputParam|ControlFieldInputParam|StopIfErrorInputParam|IsSuccessOutputParam)"
    r"\(([\s\S]*?)\)\]\s*"
    r"public partial [^\n]+\s+(\w+)\s*\{",
    re.MULTILINE,
)
KEY_ATTR_RE = re.compile(r'Key\s*=\s*"([^"]+)"')


def default_param_key(property_name: str) -> str:
    if not property_name:
        return property_name
    return property_name[0].lower() + property_name[1:]


def parse_property_key_map(content: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for body, prop in PARAM_BLOCK_RE.findall(content):
        key_match = KEY_ATTR_RE.search(body)
        mapping[prop] = key_match.group(1) if key_match else default_param_key(prop)
    return mapping


def resolve_param_token(token: str, property_map: dict[str, str]) -> str:
    """Map C# Params property token (with optional ! / :limit) to wire param key."""
    text = token.strip()
    if not text:
        return text

    use_direct = False
    limit_length: str | None = None

    colon_index = text.rfind(":")
    base = text
    if colon_index > 0 and colon_index < len(text) - 1:
        length_str = text[colon_index + 1 :]
        if length_str.isdigit():
            base = text[:colon_index]
            limit_length = length_str

    if base.endswith("!"):
        use_direct = True
        base = base[:-1]

    wire_key = property_map.get(base, default_param_key(base))
    if use_direct:
        wire_key += "!"
    if limit_length is not None:
        wire_key += f":{limit_length}"
    return wire_key


def parse_summary_part(raw: str, property_map: dict[str, str]) -> str:
    text = raw.strip()
    if not text:
        return ""

    concat = re.split(r"\s*\+\s*", text)
    out = ""
    for piece in concat:
        piece = piece.strip()
        m = NAMEOF_RE.search(piece)
        if m:
            prop = m.group(1)
            suffix = piece[m.end() :].strip()
            token = prop + suffix
            out += resolve_param_token(token, property_map)
            continue
        sm = STRING_LITERAL_RE.fullmatch(piece)
        if sm:
            out += sm.group(1)
            continue
        raise ValueError(f"unsupported summary fragment: {piece!r} in {raw!r}")
    return out


def parse_summary_args(summary_raw: str, property_map: dict[str, str]) -> list[str]:
    parts: list[str] = []
    depth = 0
    current: list[str] = []
    in_string = False
    escape = False

    for ch in summary_raw:
        if in_string:
            current.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            current.append(ch)
            continue

        if ch == "(":
            depth += 1
            current.append(ch)
            continue
        if ch == ")":
            depth -= 1
            current.append(ch)
            continue

        if ch == "," and depth == 0:
            part = parse_summary_part("".join(current), property_map)
            if part:
                parts.append(part)
            current = []
            continue

        current.append(ch)

    tail = parse_summary_part("".join(current), property_map)
    if tail:
        parts.append(tail)
    return parts


def extract_from_file(path: Path) -> tuple[str, list[str]] | None:
    content = path.read_text(encoding="utf-8")
    key_match = STEP_KEY_RE.search(content)
    summary_match = STEP_SUMMARY_RE.search(content)
    if not key_match or not summary_match:
        return None
    key = key_match.group(1).strip()
    property_map = parse_property_key_map(content)
    parts = parse_summary_args(summary_match.group(1), property_map)
    if not parts:
        return None
    return key, parts


def main() -> int:
    quicker_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_QUICKER_BUILDIN
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT

    if not quicker_dir.is_dir():
        print(f"Quicker BuildinRunners dir not found: {quicker_dir}", file=sys.stderr)
        return 1

    patterns: dict[str, list[str]] = {}
    duplicates: dict[str, list[str]] = {}

    for path in sorted(quicker_dir.rglob("*.Definition.cs")):
        parsed = extract_from_file(path)
        if parsed is None:
            continue
        key, parts = parsed
        if key in patterns and patterns[key] != parts:
            duplicates.setdefault(key, []).append(str(path.relative_to(quicker_dir)))
            continue
        patterns[key] = parts

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(patterns, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    manual_count = 0
    if MANUAL_OUT.is_file():
        manual = json.loads(MANUAL_OUT.read_text(encoding="utf-8"))
        manual_count = len(manual)

    print(f"Wrote {len(patterns)} auto patterns to {out_path}")
    if manual_count:
        print(f"Manual supplement: {manual_count} keys in {MANUAL_OUT.name} (merged at runtime)")
    if duplicates:
        print(f"Skipped {len(duplicates)} duplicate keys with conflicting patterns", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
