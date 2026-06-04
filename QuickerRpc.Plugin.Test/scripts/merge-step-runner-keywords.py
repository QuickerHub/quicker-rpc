# One-off merge helper: extends step-runner-agent-keywords.json with live-catalog gaps.
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KEYWORDS_PATH = ROOT / "QuickerRpc.AgentModel" / "Catalog" / "step-runner-agent-keywords.json"

# Curated entries for modules missing from live catalog scrape (extensions, etc.).
NEW: dict[str, dict] = {
    "sys:adobesoftscontrol": {
        "keywords": ["adobe", "photoshop", "illustrator", "premiere", "Adobe", "Adobe控制"],
        "snippet": "Control Adobe apps (JS script, etc.)",
    },
    "sys:audioControl": {
        "keywords": ["audio device", "sound output", "default speaker", "音频", "音频设备"],
        "snippet": "List or set default audio output devices",
    },
    "sys:autocadcontrol": {
        "keywords": ["autocad", "cad", "AutoCAD", "CAD控制"],
        "snippet": "Send commands to AutoCAD",
    },
    "sys:charInfo": {
        "keywords": ["character info", "unicode", "char code", "字符信息"],
        "snippet": "Get character metadata (category, code point, etc.)",
    },
    "sys:checkPathExists": {
        "keywords": ["path exists", "file exists", "folder exists", "检查路径", "文件是否存在"],
        "snippet": "Check if file/folder exists; optional file metadata",
    },
    "sys:chromecontrol": {
        "keywords": ["chrome", "edge", "firefox", "browser control", "浏览器控制", "网页"],
        "snippet": "Control Chrome/Edge/Firefox (open URL, tabs, etc.)",
    },
    "sys:cloud_oss": {
        "keywords": ["oss", "cloud storage", "image host", "upload cloud", "云存储", "图床"],
        "snippet": "Upload files via third-party cloud/OSS providers",
    },
    "sys:clouddata": {
        "keywords": ["cloud state", "network state", "global state", "云状态", "网络数据"],
        "snippet": "Read/write Quicker cloud key-value state",
    },
    "sys:color": {
        "keywords": ["color picker", "screen color", "hex rgb", "取色", "颜色转换"],
        "snippet": "Pick screen color or convert color values",
    },
    "sys:assign": {
        "keywords": ["assign", "赋值", "set variable"],
        "notFor": ["linq", "expression", "表达式"],
        "rankBias": -35,
        "snippet": "Deprecated assign step; use sys:evalexpression instead",
    },
    "sys:compute": {
        "keywords": ["compute", "calculate", "math"],
        "notFor": ["linq", "expression", "表达式", "eval", "assign", "赋值", "计算"],
        "rankBias": -28,
        "snippet": "Legacy numeric step (prefer sys:evalexpression)",
    },
    "sys:computeTime": {
        "keywords": ["time math", "date add", "date diff", "时间计算", "日期运算"],
        "snippet": "Date/time arithmetic on DateTime values",
    },
    "sys:createQrCode": {
        "keywords": ["qr code", "qrcode generate", "二维码", "生成二维码"],
        "snippet": "Encode text into a QR code image",
    },
    "sys:custompanel": {
        "keywords": ["floating panel", "action panel", "操作窗", "悬浮窗"],
        "snippet": "Show custom floating action panel",
    },
    "sys:customwindow": {
        "keywords": ["custom window", "wpf window", "自定义窗口"],
        "snippet": "Create/show custom WPF window UI",
    },
    "sys:enc": {
        "keywords": ["encrypt", "decrypt", "hash", "md5", "aes", "加密", "解密", "哈希"],
        "snippet": "Encrypt, decrypt, or hash text/data",
    },
    "sys:excelObjects": {
        "keywords": ["excel object", "excel app", "workbook", "Excel对象"],
        "snippet": "Excel application/workbook/sheet object operations",
    },
    "sys:excelRange": {
        "keywords": ["excel cell", "excel range", "spreadsheet", "Excel区域", "单元格"],
        "snippet": "Read/write Excel ranges and cells",
    },
    "sys:excelreadwrite": {
        "keywords": ["excel file", "xlsx", "read excel", "write excel", "Excel读写"],
        "snippet": "Load/save Excel workbook files",
    },
    "sys:formatString": {
        "keywords": ["format string", "concat variables", "combine text", "组合文本", "拼接变量"],
        "notFor": ["linq", "expression", "表达式", "assign", "赋值"],
        "rankBias": -18,
        "snippet": "Combine variables into text (prefer sys:evalexpression for assign/format logic)",
    },
    "sys:getChromeUrl": {
        "keywords": ["browser url", "current tab url", "浏览器网址"],
        "snippet": "Get active browser tab URL",
    },
    "sys:getCurrentTime": {
        "keywords": ["current time", "now", "datetime", "unix timestamp", "日期时间", "当前时间"],
        "snippet": "Get or parse date/time (incl. unix timestamp)",
    },
    "sys:getSelectedFiles": {
        "keywords": ["selected files", "explorer selection", "desktop selection", "选中文件"],
        "snippet": "Get selected files/folders from Explorer or desktop",
    },
    "sys:getSysInfo": {
        "keywords": ["system info", "windows info", "os version", "系统信息"],
        "snippet": "Read Windows/system environment info",
    },
    "sys:httpserver": {
        "keywords": ["http server", "local server", "file server", "HTTP服务器", "本地服务"],
        "snippet": "Start temporary local HTTP/file server",
    },
    "sys:imageinfo": {
        "keywords": ["image metadata", "exif", "image size", "图片信息", "exif"],
        "snippet": "Read image dimensions or EXIF metadata",
    },
    "sys:imeControl": {
        "keywords": ["ime", "input method", "chinese english input", "输入法"],
        "snippet": "Get or switch IME Chinese/English state",
    },
    "sys:imgToBase64": {
        "keywords": ["base64", "image base64", "file base64", "图片转base64"],
        "snippet": "Convert image/file to or from Base64 text",
    },
    "sys:joinList": {
        "keywords": ["join list", "list to text", "concat list", "列表合并", "列表转文本"],
        "notFor": ["linq", "expression", "表达式"],
        "rankBias": -8,
        "snippet": "Join list items into a single text string",
    },
    "sys:jsonExtract": {
        "keywords": ["json", "jsonpath", "parse json", "提取JSON", "JSON解析"],
        "snippet": "Extract fields from JSON text",
    },
    "sys:keyoperation": {
        "keywords": ["key state", "keyboard state", "caps lock", "按键状态", "单键"],
        "snippet": "Query or control a single key state",
    },
    "sys:mathocr": {
        "keywords": ["math ocr", "formula recognition", "latex", "公式识别"],
        "snippet": "Recognize math formulas from images",
    },
    "sys:newGuid": {
        "keywords": ["guid", "uuid", "new id", "生成Guid"],
        "snippet": "Generate a new GUID string",
    },
    "sys:numCompare": {
        "keywords": ["compare numbers", "number compare", "比较数字"],
        "notFor": ["linq", "expression", "表达式"],
        "rankBias": -10,
        "snippet": "Compare two numbers (legacy; prefer evalexpression for logic)",
    },
    "sys:numberprocess": {
        "keywords": ["number format", "number to text", "round", "数字转换"],
        "snippet": "Format or convert numbers (to text, rounding, etc.)",
    },
    "sys:officehelper": {
        "keywords": ["office", "vba", "word excel powerpoint", "Office辅助", "VBA"],
        "snippet": "Helper ops for Office apps (e.g. run VBA)",
    },
    "sys:pathExtraction": {
        "keywords": ["path parse", "filename", "directory name", "路径提取", "文件名"],
        "snippet": "Extract file name, folder, extension from paths",
    },
    "sys:playRecords": {
        "keywords": ["replay macro", "playback input", "重放键鼠", "宏回放"],
        "snippet": "Replay recorded keyboard/mouse macro",
    },
    "sys:playSound": {
        "keywords": ["play sound", "beep", "audio file", "播放声音", "提示音"],
        "snippet": "Play built-in or file sound",
    },
    "sys:randomNum": {
        "keywords": ["random number", "rand", "随机数"],
        "snippet": "Generate random numbers",
    },
    "sys:readQrCode": {
        "keywords": ["read qr", "scan qrcode", "decode qr", "识别二维码"],
        "snippet": "Decode QR code from image",
    },
    "sys:record": {
        "keywords": ["record macro", "record input", "录制键鼠", "录宏"],
        "snippet": "Record keyboard/mouse actions for replay",
    },
    "sys:recordSound": {
        "keywords": ["record audio", "speech recognition", "voice", "录音", "语音识别"],
        "snippet": "Record audio or run speech recognition",
    },
    "sys:regexExtract": {
        "keywords": ["regex", "regular expression", "regexp", "正则", "正则提取"],
        "snippet": "Extract text with regular expressions",
    },
    "sys:restoreActiveWindow": {
        "keywords": ["restore focus", "active window", "恢复窗口", "焦点"],
        "snippet": "Restore previous foreground window focus",
    },
    "sys:rhinocontrol": {
        "keywords": ["rhino", "rhinoceros", "3d cad", "Rhino控制"],
        "snippet": "Send commands/scripts to Rhino",
    },
    "sys:sendMessage": {
        "keywords": ["sendmessage", "win32 message", "window message", "窗口消息"],
        "snippet": "Send Win32 SendMessage to a window",
    },
    "sys:smtp": {
        "keywords": ["smtp", "send email", "mail", "邮件", "发邮件"],
        "snippet": "Send email via SMTP",
    },
    "sys:splitString": {
        "keywords": ["split text", "text to list", "delimiter", "拆分文本", "文本转列表"],
        "notFor": ["linq", "expression", "表达式"],
        "rankBias": -8,
        "snippet": "Split text into a list by delimiter",
    },
    "sys:strCompare": {
        "keywords": ["string compare", "text compare", "比较文本"],
        "notFor": ["linq", "expression", "表达式"],
        "rankBias": -10,
        "snippet": "Compare two text strings (legacy compare step)",
    },
    "sys:strReplace": {
        "keywords": ["replace text", "find replace", "substitute", "替换文本", "文本替换"],
        "notFor": ["linq", "expression", "表达式"],
        "rankBias": -10,
        "snippet": "Replace substrings in text (built-in replace modes)",
    },
    "sys:tempImgBed": {
        "keywords": ["temp image host", "image bed", "upload image url", "临时图床"],
        "snippet": "Upload image to temporary Quicker image host",
    },
    "sys:textCounter": {
        "keywords": ["word count", "char count", "line count", "字数统计"],
        "snippet": "Count lines, characters, words in text",
    },
    "sys:textSelectTools": {
        "keywords": ["select text helper", "pick file text", "辅助选择", "选取文本"],
        "snippet": "Helper tools to select content and get text",
    },
    "sys:translation": {
        "keywords": ["translate", "translation", "dictionary", "翻译", "机器翻译"],
        "snippet": "Machine translation via third-party APIs (paid feature)",
    },
    "sys:webview2": {
        "keywords": ["webview2", "embedded browser", "edge webview", "WebView2", "内嵌浏览器"],
        "snippet": "Open/control WebView2 embedded browser window",
    },
    "sys:whiteboard": {
        "keywords": ["whiteboard", "handwriting", "draw", "手写板", "手写"],
        "snippet": "Hand-draw content and output as image",
    },
    "sys:winservice": {
        "keywords": ["windows service", "registry", "regedit", "服务", "注册表"],
        "snippet": "Query Windows services or registry",
    },
}

# Full key order: existing authoring order + new keys grouped by category.
ORDER: list[str] = [
    "sys:if",
    "sys:simpleIf",
    "sys:each",
    "sys:repeat",
    "sys:break",
    "sys:continue",
    "sys:stop",
    "sys:group",
    "sys:comment",
    "sys:delay",
    "sys:waitClipboardChange",
    "sys:waitKeyboard",
    "sys:fileSystemWatch",
    "sys:stateStorage",
    "sys:dependencycheck",
    "sys:winservice",
    "sys:clouddata",
    "sys:MsgBox",
    "sys:notify",
    "sys:showText",
    "sys:outputText",
    "sys:userInput",
    "sys:select",
    "sys:showmenu",
    "sys:form",
    "sys:showWaitWin",
    "sys:reportProgress",
    "sys:customwindow",
    "sys:custompanel",
    "sys:getClipboardText",
    "sys:writeClipboard",
    "sys:getClipboardImage",
    "sys:getClipboardFiles",
    "sys:fileToClipboard",
    "sys:getSelectedText",
    "sys:textSelectTools",
    "sys:getSelectedFiles",
    "sys:readFile",
    "sys:WriteTextFile",
    "sys:fileOperation",
    "sys:selectFile",
    "sys:selectFolder",
    "sys:zip",
    "sys:GenTempFilePath",
    "sys:getExplorerPath",
    "sys:getFolderPath",
    "sys:SelectFileInExplorer",
    "sys:everythingsearch",
    "sys:checkPathExists",
    "sys:pathExtraction",
    "sys:stringProcess",
    "sys:htmlExtract",
    "sys:jsonExtract",
    "sys:regexExtract",
    "sys:strReplace",
    "sys:splitString",
    "sys:joinList",
    "sys:formatString",
    "sys:textCounter",
    "sys:strCompare",
    "sys:charInfo",
    "sys:translation",
    "sys:listOperations",
    "sys:manageList",
    "sys:dictOperations",
    "sys:tableoperation",
    "sys:dboperation",
    "sys:enc",
    "sys:numCompare",
    "sys:numberprocess",
    "sys:randomNum",
    "sys:newGuid",
    "sys:getCurrentTime",
    "sys:computeTime",
    "sys:sendKeys",
    "sys:keyInput",
    "sys:keyoperation",
    "sys:mouse",
    "sys:inputScript",
    "sys:record",
    "sys:playRecords",
    "sys:imeControl",
    "sys:getWindowTitle",
    "sys:activateProcessMainWindow",
    "sys:checkProcessExists",
    "sys:getActiveProcessInfo",
    "sys:restoreActiveWindow",
    "sys:windowOperations",
    "sys:sendMessage",
    "sys:uiautomation",
    "sys:flauiautomation",
    "sys:searchBmp",
    "sys:http",
    "sys:download",
    "sys:websocket",
    "sys:httpserver",
    "sys:smtp",
    "sys:basic-ocr",
    "sys:mathocr",
    "sys:ai",
    "sys:tempcloudstore",
    "sys:tempImgBed",
    "sys:cloud_oss",
    "sys:openUrl",
    "sys:chromecontrol",
    "sys:getChromeUrl",
    "sys:webview2",
    "sys:run",
    "sys:subprogram",
    "sys:runAction",
    "sys:evalexpression",
    "sys:assign",
    "sys:compute",
    "sys:csscript",
    "sys:pythonscript",
    "sys:jsscript",
    "sys:runScript",
    "sys:shelloperation",
    "sys:excelreadwrite",
    "sys:excelRange",
    "sys:excelObjects",
    "sys:officehelper",
    "sys:adobesoftscontrol",
    "sys:autocadcontrol",
    "sys:rhinocontrol",
    "sys:screenCapture",
    "sys:screenCapturePro",
    "sys:WriteImageFile",
    "sys:imgProcess",
    "sys:imageinfo",
    "sys:imgToBase64",
    "sys:color",
    "sys:createQrCode",
    "sys:readQrCode",
    "sys:showImage",
    "sys:whiteboard",
    "sys:playSound",
    "sys:recordSound",
    "sys:audioControl",
    "sys:quickeroperations",
    "sys:getActionInfo",
    "sys:getQuickerInfo",
    "sys:getSysInfo",
]


def main() -> None:
    existing = json.loads(KEYWORDS_PATH.read_text(encoding="utf-8"))
    merged = {**existing, **NEW}
    unknown_order = [k for k in ORDER if k not in merged]
    if unknown_order:
        raise SystemExit(f"ORDER references missing keys: {unknown_order}")
    extra = set(merged) - set(ORDER)
    if extra:
        raise SystemExit(f"Merged keys not in ORDER: {sorted(extra)}")
    ordered = {k: merged[k] for k in ORDER}
    KEYWORDS_PATH.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(ordered)} entries to {KEYWORDS_PATH}")


if __name__ == "__main__":
    main()
