# Generate quicker-settings-agent-keywords.json + quicker-settings-ui-pages.json
# from Quicker.exe SettingsMenuProvider (official UI titles) + agent supplements.
from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "QuickerRpc.AgentModel" / "Catalog"
OUT_KEYWORDS = CATALOG / "quicker-settings-agent-keywords.json"
OUT_UI_PAGES = CATALOG / "quicker-settings-ui-pages.json"
QUICKER_EXE = Path(r"C:\Program Files\Quicker\Quicker.exe")

TITLE_SUFFIXES = (
    "参数设置",
    "相关选项",
    "功能设置",
    "基本参数设置",
    "设置",
    "管理",
)

# Agent-facing synonyms / English aliases — never override Quicker official titles.
PAGE_SUPPLEMENTS: dict[str, dict] = {
    "ActionRecycleBinSettingPage": {
        "keywords": ["回收站", "action recycle", "recycle bin"],
        "openAliases": ["recycle-bin", "action-recycle-bin", "回收站"],
    },
    "AppSettings": {
        "keywords": ["websocket", "app 连接", "app连接"],
        "openAliases": ["app-settings", "websocket"],
    },
    "BasicInfo": {
        "keywords": ["基本选项", "general", "基本信息"],
        "openAliases": ["general", "app-settings", "常规", "常规设置", "基本选项"],
    },
    "CircleMenuSettingPage": {
        "keywords": ["圆圈菜单", "circle menu", "圆形菜单", "轮盘"],
        "openAliases": ["circle-menu", "轮盘菜单", "轮盘", "圆圈菜单"],
    },
    "GesturesSettingPage": {
        "keywords": ["手势", "mouse gesture", "划动"],
        "openAliases": ["gestures", "手势", "鼠标手势"],
    },
    "TextCommandSettingPage": {
        "keywords": ["文本命令", "text command", "命令词"],
        "openAliases": ["text-command", "文本命令", "文本指令"],
    },
    "SearchSettings": {
        "keywords": ["search", "启动器搜索"],
        "openAliases": ["search-settings", "搜索设置"],
    },
    "UISettingsPage": {
        "keywords": ["界面", "UI", "主题", "外观", "深色模式", "界面设置"],
        "openAliases": ["ui", "ui-settings", "界面", "面板窗口"],
    },
    "BlackListSettings": {
        "keywords": ["blacklist", "排除进程"],
        "openAliases": ["blacklist", "黑名单"],
    },
    "PowerKeysSettingsPage": {
        "keywords": ["高级按键", "power keys", "按键增强"],
        "openAliases": ["power-keys", "扩展热键", "高级按键"],
    },
    "FunctionHotkeys": {
        "openAliases": ["hotkeys", "功能快捷键", "快捷键"],
    },
    "AboutSettingPage": {
        "openAliases": ["about", "关于", "about-quicker"],
    },
    "SyncSettingPage": {
        "openAliases": ["sync", "同步", "数据同步"],
    },
    "UpdateActionsPage": {
        "openAliases": ["update-actions", "批量更新", "批量更新动作"],
    },
    "AutoRunActions": {
        "openAliases": ["auto-run", "自动运行", "自动运行动作"],
    },
    "EventTriggerSettingsPage": {
        "openAliases": ["event-trigger", "事件触发"],
    },
    "ActionDesignerSettingsPage": {
        "openAliases": ["action-designer", "动作编辑器", "动作设计"],
    },
    "ContextMenuGeneralSettings": {
        "openAliases": ["context-menu", "上下文菜单"],
    },
    "HotkeyWatcherSettingsPage": {
        "openAliases": ["hotkey-watcher", "热键联动"],
    },
    "ActionHotkeysSettingPage": {
        "openAliases": ["action-hotkeys", "动作快捷键"],
    },
    "LeftButtonPlusSettingPage": {
        "keywords": ["左键增强", "left button plus"],
        "openAliases": ["left-button-plus", "左键辅助", "左键增强"],
    },
    "PanelPopupSettings": {
        "keywords": ["弹出面板", "中键弹出", "面板弹出"],
        "openAliases": ["panel-popup", "弹出面板"],
    },
}

CURATED: dict[str, dict] = {
    "userSettings:EnableCircleMenu": {
        "title": "启用轮盘菜单",
        "keywords": ["轮盘菜单", "轮盘", "圆圈菜单", "circle menu", "圆形菜单"],
        "snippet": "是否启用鼠标轮盘菜单触发方式（Quicker 设置页：轮盘菜单设置）",
        "pageId": "CircleMenuSettingPage",
    },
    "userSettings:EnableGesture": {
        "title": "启用鼠标手势",
        "keywords": ["鼠标手势", "手势", "mouse gesture", "划动", "手势触发"],
        "pageId": "GesturesSettingPage",
    },
    "userSettings:EnableTextCommand": {
        "title": "启用文本指令",
        "keywords": ["文本指令", "文本命令", "text command", "命令词", "快捷命令"],
        "pageId": "TextCommandSettingPage",
    },
    "userSettings:EnableLeftButtonPlus": {
        "title": "启用左键辅助",
        "keywords": ["左键辅助", "左键增强", "左键+", "left button plus", "鼠标左键"],
        "pageId": "LeftButtonPlusSettingPage",
    },
    "userSettings:OpenPopupWithMiddleClick": {
        "title": "中键弹出面板",
        "keywords": ["中键", "滚轮键", "middle click", "弹出面板", "中键弹出"],
        "snippet": "鼠标中键点击时弹出 Quicker 面板",
        "pageId": "PanelPopupSettings",
    },
    "userSettings:OpenPopupWithRightPressMove": {
        "title": "右键移动弹出面板",
        "keywords": ["右键", "right click", "右键弹出", "按住右键"],
        "pageId": "PanelPopupSettings",
    },
    "userSettings:OpenWithGlobalHotkey": {
        "title": "全局快捷键弹出",
        "keywords": ["全局快捷键", "热键", "hotkey", "弹出快捷键", "唤醒"],
        "pageId": "FunctionHotkeys",
    },
    "userSettings:IsAutoMinimize": {
        "title": "启动后自动最小化",
        "keywords": ["自动最小化", "最小化", "托盘", "启动最小化"],
        "pageId": "BasicInfo",
    },
    "userSettings:ShowRunningCountOnTrayIcon": {
        "title": "托盘图标显示运行次数",
        "keywords": ["托盘", "运行次数", "tray icon", "任务栏"],
    },
    "userSettings:EnableAutoBackupActions": {
        "title": "自动备份动作",
        "keywords": ["自动备份", "备份动作", "action backup"],
        "pageId": "ActionRecycleBinSettingPage",
    },
    "userSettings:DisableOnFullscreenApp": {
        "title": "全屏应用时禁用",
        "keywords": ["全屏", "fullscreen", "游戏全屏", "禁用触发"],
    },
    "userSettings:DefaultBrowser": {
        "title": "默认浏览器",
        "keywords": ["默认浏览器", "browser", "浏览器"],
        "pageId": "BasicInfo",
    },
    "userSettings:ImeToEnHotkey": {
        "title": "切换英文输入法热键",
        "keywords": ["输入法", "英文", "IME", "切换英文"],
    },
    "userSettings:ImeToZhHotkey": {
        "title": "切换中文输入法热键",
        "keywords": ["输入法", "中文", "IME", "切换中文"],
    },
    "userPreference:SkipConfirmationWhenBatchUpdateActions": {
        "title": "批量更新动作时跳过确认",
        "keywords": ["批量更新", "跳过确认", "确认对话框", "更新动作"],
        "pageId": "UpdateActionsPage",
    },
    "userPreference:SettingsHotKeyGroupBy": {
        "title": "设置页快捷键分组",
        "keywords": ["设置分组", "快捷键分组", "settings hotkey"],
    },
}


def split_camel(name: str) -> list[str]:
    parts = re.sub(r"([a-z])([A-Z])", r"\1 \2", name).replace("_", " ").split()
    return [p.lower() for p in parts if p]


def strip_title_suffix(title: str) -> str:
    text = title.strip()
    for suffix in TITLE_SUFFIXES:
        if text.endswith(suffix) and len(text) > len(suffix):
            return text[: -len(suffix)].strip()
    return text


def tokenize_ui_text(text: str) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    tokens: list[str] = [text]
    stripped = strip_title_suffix(text)
    if stripped and stripped != text:
        tokens.append(stripped)
    for part in re.split(r"[\s,;|/、，；]+", text):
        part = part.strip()
        if part and part not in tokens:
            tokens.append(part)
    return tokens


def derive_page_keywords(page: dict, supplements: list[str]) -> list[str]:
    kws: list[str] = []
    for field in ("title", "fullTitle", "description", "keywords"):
        raw = page.get(field) or ""
        if not raw:
            continue
        kws.extend(tokenize_ui_text(str(raw)))
        for token in str(raw).split():
            token = token.strip()
            if token:
                kws.extend(tokenize_ui_text(token))
    kws.extend(supplements)
    kws.extend(split_camel(page.get("pageId", "")))
    return list(dict.fromkeys(k for k in kws if k))


def ps_collect() -> tuple[list[str], list[dict]]:
    tmp_out = ROOT / ".local" / "_settings-extract.tmp.txt"
    tmp_out.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = str(tmp_out).replace("\\", "\\\\")
    script = rf"""
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$ErrorActionPreference = 'Stop'
$outPath = '{tmp_path}'
$asm = [Reflection.Assembly]::LoadFrom('{QUICKER_EXE.as_posix()}')
function Get-Props($type, $prefix) {{
    foreach ($p in $type.GetProperties([Reflection.BindingFlags]'Public,Instance')) {{
        if ($p.GetIndexParameters().Length -gt 0) {{ continue }}
        $path = if ($prefix) {{ "$prefix.$($p.Name)" }} else {{ $p.Name }}
        $t = $p.PropertyType
        $inner = [Nullable]::GetUnderlyingType($t)
        if ($inner) {{ $t = $inner }}
        $isScalar = $t.IsPrimitive -or $t -eq [string] -or $t.IsEnum -or $t -eq [decimal] -or $t -eq [datetime]
        $isComplex = [System.Collections.IEnumerable].IsAssignableFrom($t) -and $t -ne [string]
        if ($isScalar) {{
            [void]$lines.Add("userSettings:$path")
        }} elseif ($isComplex) {{
            [void]$lines.Add("userSettings:$path")
        }} elseif ($t.IsClass) {{
            Get-Props $t $path
        }}
    }}
}}
$lines = [System.Collections.Generic.List[string]]::new()
$rds = $asm.GetType('Quicker.Domain.Services.Data.RuntimeDataStore')
$us = $rds.GetProperty('UserSettings').PropertyType
Get-Props $us ''
$pref = $asm.GetType('Quicker.Domain.Entities.UserPreference')
foreach ($p in $pref.GetProperties([Reflection.BindingFlags]'Public,Instance')) {{
    [void]$lines.Add("userPreference:$($p.Name)")
}}
$es = $asm.GetType('Quicker.Domain.Entities.ExeSettings')
foreach ($p in $es.GetProperties([Reflection.BindingFlags]'Public,Instance')) {{
    $t = $p.PropertyType
    $inner = [Nullable]::GetUnderlyingType($t)
    if ($inner) {{ $t = $inner }}
    $isScalar = $t.IsPrimitive -or $t -eq [string] -or $t.IsEnum
    $isComplex = [System.Collections.IEnumerable].IsAssignableFrom($t) -and $t -ne [string]
    if ($isScalar -or $isComplex) {{ [void]$lines.Add("exeSettings:$($p.Name)") }}
    elseif ($t.IsClass) {{ Get-Props $t "exeSettings:$($p.Name)" }}
}}
[void]$lines.Add('---PAGES---')
$smp = $asm.GetType('Quicker.Settings.SettingsMenuProvider')
$inst = $smp.GetFields([Reflection.BindingFlags]'Static,NonPublic') | Where-Object {{ $_.FieldType -eq $smp }} | Select-Object -First 1
$provider = $inst.GetValue($null)
$pages = $smp.GetProperty('AllPages').GetValue($provider)
foreach ($page in $pages) {{
    $id = $page.Id.ToString()
    $title = $page.Title
    $fullTitle = $page.FullTitle
    $desc = $page.Description
    $kw = $page.KeyWords
    $icon = $page.Icon
    [void]$lines.Add(("PAGE|$id|$title|$fullTitle|$desc|$kw|$icon"))
}}
[System.IO.File]::WriteAllLines($outPath, $lines, [System.Text.UTF8Encoding]::new($false))
"""
    subprocess.run(
        ["pwsh", "-NoProfile", "-Command", script],
        check=True,
    )
    text = tmp_out.read_text(encoding="utf-8")
    keys: list[str] = []
    pages: list[dict] = []
    in_pages = False
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line == "---PAGES---":
            in_pages = True
            continue
        if in_pages:
            if line.startswith("PAGE|"):
                parts = (line.split("|", 6) + [""] * 7)[:7]
                _, page_id, title, full_title, desc, kw, icon = parts
                pages.append(
                    {
                        "pageId": page_id,
                        "title": title,
                        "fullTitle": full_title or title,
                        "description": desc,
                        "keywords": kw,
                        "icon": icon,
                    }
                )
        else:
            keys.append(line)
    return keys, pages


def build_entry(key: str) -> dict:
    path = key.split(":", 1)[-1]
    words = split_camel(path.split(".")[-1])
    keywords = list(dict.fromkeys([path.split(".")[-1], *words]))
    entry: dict = {
        "keywords": keywords,
        "snippet": f"Quicker setting {path}",
    }
    if key in CURATED:
        curated = CURATED[key]
        if curated.get("title"):
            entry["title"] = curated["title"]
        if curated.get("keywords"):
            entry["keywords"] = list(
                dict.fromkeys(curated["keywords"] + entry["keywords"])
            )
        if curated.get("snippet"):
            entry["snippet"] = curated["snippet"]
        if curated.get("pageId"):
            entry["pageId"] = curated["pageId"]
    return entry


def write_ui_pages_catalog(pages: list[dict]) -> None:
    payload = {
        "source": "Quicker.Settings.SettingsMenuProvider.AllPages",
        "quickerExe": str(QUICKER_EXE),
        "extractedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pages": sorted(pages, key=lambda p: p["pageId"]),
    }
    OUT_UI_PAGES.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    if not QUICKER_EXE.is_file():
        raise SystemExit(f"Quicker.exe not found: {QUICKER_EXE}")

    keys, pages = ps_collect()
    write_ui_pages_catalog(pages)

    data: dict[str, dict] = {}

    for key in keys:
        data[key] = build_entry(key)

    for key, curated in CURATED.items():
        if key not in data:
            data[key] = build_entry(key)

    for page in pages:
        page_id = page["pageId"]
        supplement = PAGE_SUPPLEMENTS.get(page_id, {})
        official_title = (page.get("fullTitle") or page.get("title") or page_id).strip()
        page_key = f"page:{page_id}"
        open_aliases = list(dict.fromkeys(supplement.get("openAliases") or []))
        extra_keywords = supplement.get("keywords") or []
        ui_keywords = derive_page_keywords(page, extra_keywords)
        snippet = page.get("description") or (
            f"Quicker 设置页：{official_title}。Open: qkrpc settings open --page {page_id}"
        )
        data[page_key] = {
            "title": official_title,
            "keywords": ui_keywords,
            "snippet": snippet,
            "pageId": page_id,
            "kind": "page",
            "openAliases": open_aliases,
        }

    OUT_KEYWORDS.parent.mkdir(parents=True, exist_ok=True)
    OUT_KEYWORDS.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(pages)} UI pages -> {OUT_UI_PAGES}")
    print(f"Wrote {len(data)} keyword entries -> {OUT_KEYWORDS}")


if __name__ == "__main__":
    main()
