# Generate quicker-settings-agent-keywords.json from Quicker.exe metadata + curated aliases.
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = ROOT / "QuickerRpc.AgentModel" / "Catalog" / "quicker-settings-agent-keywords.json"
QUICKER_EXE = Path(r"C:\Program Files\Quicker\Quicker.exe")

# Curated Chinese titles / keywords for high-traffic settings (merged over auto-generated stubs).
CURATED: dict[str, dict] = {
    "userSettings:EnableCircleMenu": {
        "title": "启用圆圈菜单",
        "keywords": ["圆圈菜单", "轮盘菜单", "circle menu", "圆形菜单", "手势菜单"],
        "snippet": "是否启用鼠标圆圈菜单（轮盘）触发方式",
        "pageId": "CircleMenuSettingPage",
    },
    "userSettings:EnableGesture": {
        "title": "启用手势",
        "keywords": ["手势", "mouse gesture", "划动", "手势触发"],
        "pageId": "GesturesSettingPage",
    },
    "userSettings:EnableTextCommand": {
        "title": "启用文本命令",
        "keywords": ["文本命令", "text command", "命令词", "快捷命令"],
        "pageId": "TextCommandSettingPage",
    },
    "userSettings:EnableLeftButtonPlus": {
        "title": "启用左键增强",
        "keywords": ["左键增强", "左键+", "left button plus", "鼠标左键"],
        "pageId": "LeftButtonPlusSettingPage",
    },
    "userSettings:OpenPopupWithMiddleClick": {
        "title": "中键弹出面板",
        "keywords": ["中键", "滚轮键", "middle click", "弹出面板", "中键弹出"],
        "snippet": "鼠标中键点击时弹出 Quicker 面板",
    },
    "userSettings:OpenPopupWithRightPressMove": {
        "title": "右键移动弹出面板",
        "keywords": ["右键", "right click", "右键弹出", "按住右键"],
    },
    "userSettings:OpenWithGlobalHotkey": {
        "title": "全局快捷键弹出",
        "keywords": ["全局快捷键", "热键", "hotkey", "弹出快捷键", "唤醒"],
        "pageId": "FunctionHotkeys",
    },
    "userSettings:IsAutoMinimize": {
        "title": "启动后自动最小化",
        "keywords": ["自动最小化", "最小化", "托盘", "启动最小化"],
        "pageId": "AppSettings",
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
        "pageId": "AppSettings",
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
    },
    "userPreference:SettingsHotKeyGroupBy": {
        "title": "设置页快捷键分组",
        "keywords": ["设置分组", "快捷键分组", "settings hotkey"],
    },
}

PAGE_ALIASES: dict[str, dict] = {
    "ActionRecycleBinSettingPage": {
        "title": "动作回收站",
        "keywords": ["动作回收站", "回收站", "action recycle", "recycle bin"],
        "openAliases": ["recycle-bin", "action-recycle-bin", "动作回收站", "回收站"],
    },
    "AppSettings": {
        "title": "常规设置",
        "keywords": ["常规", "基本选项", "general", "app settings"],
        "openAliases": ["general", "app-settings", "常规", "常规设置", "基本选项"],
    },
    "CircleMenuSettingPage": {
        "title": "圆圈菜单设置",
        "keywords": ["圆圈菜单", "轮盘", "circle menu", "圆形菜单"],
        "openAliases": ["circle-menu", "圆圈菜单"],
    },
    "GesturesSettingPage": {
        "title": "手势设置",
        "keywords": ["手势", "mouse gesture", "划动"],
    },
    "TextCommandSettingPage": {
        "title": "文本命令",
        "keywords": ["文本命令", "命令词", "text command"],
    },
    "SearchSettings": {
        "title": "搜索设置",
        "keywords": ["搜索", "search", "启动器搜索"],
    },
    "UISettingsPage": {
        "title": "界面设置",
        "keywords": ["界面", "UI", "主题", "外观", "深色模式"],
    },
    "FloatSettings": {
        "title": "悬浮窗设置",
        "keywords": ["悬浮窗", "浮动按钮", "float", "悬浮"],
    },
    "AppSettings": {
        "title": "基本选项",
        "keywords": ["基本选项", "常规", "general", "应用设置"],
    },
    "BlackListSettings": {
        "title": "黑名单",
        "keywords": ["黑名单", "blacklist", "排除进程"],
    },
    "PowerKeysSettingsPage": {
        "title": "高级按键",
        "keywords": ["高级按键", "power keys", "按键增强"],
    },
}


def split_camel(name: str) -> list[str]:
    parts = re.sub(r"([a-z])([A-Z])", r"\1 \2", name).replace("_", " ").split()
    return [p.lower() for p in parts if p]


def ps_collect() -> tuple[list[str], list[dict]]:
    script = r"""
$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
function Get-Props($type, $prefix) {
    foreach ($p in $type.GetProperties([Reflection.BindingFlags]'Public,Instance')) {
        if ($p.GetIndexParameters().Length -gt 0) { continue }
        $path = if ($prefix) { "$prefix.$($p.Name)" } else { $p.Name }
        $t = $p.PropertyType
        $inner = [Nullable]::GetUnderlyingType($t)
        if ($inner) { $t = $inner }
        $isScalar = $t.IsPrimitive -or $t -eq [string] -or $t.IsEnum -or $t -eq [decimal] -or $t -eq [datetime]
        $isComplex = [System.Collections.IEnumerable].IsAssignableFrom($t) -and $t -ne [string]
        if ($isScalar) {
            Write-Output "userSettings:$path"
        } elseif ($isComplex) {
            Write-Output "userSettings:$path"
        } elseif ($t.IsClass) {
            Get-Props $t $path
        }
    }
}
$rds = $asm.GetType('Quicker.Domain.Services.Data.RuntimeDataStore')
$us = $rds.GetProperty('UserSettings').PropertyType
Get-Props $us ''
$pref = $asm.GetType('Quicker.Domain.Entities.UserPreference')
foreach ($p in $pref.GetProperties([Reflection.BindingFlags]'Public,Instance')) {
    Write-Output "userPreference:$($p.Name)"
}
$es = $asm.GetType('Quicker.Domain.Entities.ExeSettings')
foreach ($p in $es.GetProperties([Reflection.BindingFlags]'Public,Instance')) {
    $t = $p.PropertyType
    $inner = [Nullable]::GetUnderlyingType($t)
    if ($inner) { $t = $inner }
    $isScalar = $t.IsPrimitive -or $t -eq [string] -or $t.IsEnum
    $isComplex = [System.Collections.IEnumerable].IsAssignableFrom($t) -and $t -ne [string]
    if ($isScalar -or $isComplex) { Write-Output "exeSettings:$($p.Name)" }
    elseif ($t.IsClass) { Get-Props $t "exeSettings:$($p.Name)" }
}
Write-Output '---PAGES---'
$smp = $asm.GetType('Quicker.Settings.SettingsMenuProvider')
$inst = $smp.GetFields([Reflection.BindingFlags]'Static,NonPublic') | Where-Object { $_.FieldType -eq $smp } | Select-Object -First 1
$provider = $inst.GetValue($null)
$pages = $smp.GetProperty('AllPages').GetValue($provider)
foreach ($page in $pages) {
    $id = $page.Id.ToString()
    $title = $page.Title
    $kw = $page.KeyWords
    Write-Output ("PAGE|$id|$title|$kw")
}
"""
    proc = subprocess.run(
        ["pwsh", "-NoProfile", "-Command", script],
        capture_output=True,
        text=True,
        check=True,
    )
    keys: list[str] = []
    pages: list[dict] = []
    in_pages = False
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        if line == "---PAGES---":
            in_pages = True
            continue
        if in_pages:
            if line.startswith("PAGE|"):
                _, page_id, title, kw = (line.split("|", 3) + ["", "", ""])[:4]
                pages.append({"pageId": page_id, "title": title, "keywords": kw})
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


def main() -> None:
    if not QUICKER_EXE.is_file():
        raise SystemExit(f"Quicker.exe not found: {QUICKER_EXE}")

    keys, pages = ps_collect()
    data: dict[str, dict] = {}

    for key in keys:
        data[key] = build_entry(key)

    for key, curated in CURATED.items():
        if key not in data:
            data[key] = build_entry(key)

    for page in pages:
        page_id = page["pageId"]
        alias = PAGE_ALIASES.get(page_id, {})
        page_key = f"page:{page_id}"
        kws: list[str] = []
        if page.get("keywords"):
            kws.extend(x.strip() for x in page["keywords"].split() if x.strip())
        if alias.get("keywords"):
            kws.extend(alias["keywords"])
        kws.extend(split_camel(page_id))
        open_aliases = alias.get("openAliases") or []
        data[page_key] = {
            "title": alias.get("title") or page.get("title") or page_id,
            "keywords": list(dict.fromkeys(kws)),
            "snippet": f"Quicker settings page: {page_id}. Open: qkrpc settings open --page {page_id}",
            "pageId": page_id,
            "kind": "page",
            "openAliases": open_aliases,
        }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(data)} entries -> {OUT_PATH}")


if __name__ == "__main__":
    main()
