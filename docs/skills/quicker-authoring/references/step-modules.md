# Step modules reference

**何时读**：**`overview`** P4–P5 — 定好 `key` 后。**默认只调 `qkrpc_step_runner_get`**（字段 `purpose`、`controlField.selection` 已含模块说明）；仅复杂模块再读 reference。

## 信息源（分工）

| 层级 | 来源 | 内容 |
|------|------|------|
| 1 选型 | **`implementation-fallback`** · **`expressions`** | 表达式优先；专用模块 vs csscript |
| 2 发现 | **`step-runner-search`** · **`_catalog`** | `key`、`controlField`、snippet |
| 3 **默认** | **`qkrpc_step_runner_get`** | 参数/输出 **键名、类型、purpose**（权威，足够写大多数步骤） |
| 4 可选 | **`docs_get_reference(step-modules, file)`** | 复杂模块补充（见 `_catalog`）；分 **手写** / **KC 爬取** 两类 |

**禁止**：未 `get` 就猜键名；对「仅 get」模块去读不存在的 reference。

## 哪些模块有 reference？

| 类型 | 路径 | 维护 |
|------|------|------|
| **手写** | `authoring-references/step-modules/authored/<id>.md` | 仓库直接编辑；规范见 **`authored/SPEC.md`** |
| **KC 全文** | `authoring-references/step-modules/kc/<id>.md` | `npm run docs:modules:crawl` 爬取；官方全文，供搜索检索 `kc/<id>` |

约 **44** 个模块有手写 reference；**全部**模块均有 KC 全文（见 **`_catalog`**）；其余无 ref 文件模块 `step-runner get` 已够。

## 读取方式

```text
qkrpc_step_runner_get({ key: "sys:http", controlField: "GET" })   # 默认路径
docs_get_reference({ topic: "step-modules", file: "_catalog" })     # 有无 reference
docs_get_reference({ topic: "step-modules", file: "http" })       # 仅有 reference 的模块
```

## 分类速查

# 步骤模块目录

大多数模块 **只需** `qkrpc_step_runner_get`（各字段 `purpose` / `controlField.selection` 已足够写步骤）。
下列 **有 reference** 的模块：`docs_get_reference({ topic: "step-modules", file: "<id>" })`。

- **手写**（`references/step-modules/authored/`）：仓库维护；见 `authored/SPEC.md`。
- **KC 爬取**（`references/step-modules/kc/`）：官方全文，供搜索检索；`docs_get_reference({ file: "kc/<id>" })`。

## 手写 reference

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `GenTempFilePath` | `sys:GenTempFilePath` | Generate random temp file path | [gentempfilepath](https://getquicker.net/KC/Help/Doc/gentempfilepath) |
| `MsgBox` | `sys:MsgBox` | Show message or confirmation dialog | [msgbox](https://getquicker.net/KC/Help/Doc/msgbox) |
| `SelectFileInExplorer` | `sys:SelectFileInExplorer` | Select/highlight file in Explorer | [selectfileinexplorer](https://getquicker.net/KC/Help/Doc/selectfileinexplorer) |
| `WriteImageFile` | `sys:WriteImageFile` | Write image variable to file | [writeimagefile](https://getquicker.net/KC/Help/Doc/writeimagefile) |
| `WriteTextFile` | `sys:WriteTextFile` | Write text to a file | [writetextfile](https://getquicker.net/KC/Help/Doc/writetextfile) |
| `activateProcessMainWindow` | `sys:activateProcessMainWindow` | Bring process main window to front | [activateprocessmainwindow](https://getquicker.net/KC/Help/Doc/activateprocessmainwindow) |
| `adobesoftscontrol` | `sys:adobesoftscontrol` | Control Adobe apps (JS script, etc.) | [adobesoftscontrol](https://getquicker.net/KC/Help/Doc/adobesoftscontrol) |
| `ai` | `sys:ai` | Call third-party AI services | [ai](https://getquicker.net/KC/Help/Doc/ai) |
| `assign` | `sys:assign` | Assign value to action variable (literal, $$, $=, or input.var copy); default for single-var writes | [assign](https://getquicker.net/KC/Help/Doc/assign) |
| `audioControl` | `sys:audioControl` | List or set default audio output devices | [audiocontrol](https://getquicker.net/KC/Help/Doc/audiocontrol) |
| `autocadcontrol` | `sys:autocadcontrol` | Send commands to AutoCAD | [autocadcontrol](https://getquicker.net/KC/Help/Doc/autocadcontrol) |
| `basic-ocr` | `sys:basic-ocr` | OCR text from image | [basic-ocr](https://getquicker.net/KC/Help/Doc/basic-ocr) |
| `break` | `sys:break` | Break out of each/repeat loop | [break](https://getquicker.net/KC/Help/Doc/break) |
| `charInfo` | `sys:charInfo` | Get character metadata (category, code point, etc.) | [charinfo](https://getquicker.net/KC/Help/Doc/charinfo) |
| `checkPathExists` | `sys:checkPathExists` | Check if file/folder exists; optional file metadata | [checkpathexists](https://getquicker.net/KC/Help/Doc/checkpathexists) |
| `checkProcessExists` | `sys:checkProcessExists` | Check if process is running | [checkprocessexists](https://getquicker.net/KC/Help/Doc/checkprocessexists) |
| `chromecontrol` | `sys:chromecontrol` | Control Chrome/Edge/Firefox (open URL, tabs, etc.) | [chromecontrol](https://getquicker.net/KC/Help/Doc/chromecontrol) |
| `cloud_oss` | `sys:cloud_oss` | Upload files via third-party cloud/OSS providers | [cloud_oss](https://getquicker.net/KC/Help/Doc/cloud_oss) |
| `clouddata` | `sys:clouddata` | Read/write Quicker cloud key-value state | [clouddata](https://getquicker.net/KC/Help/Doc/clouddata) |
| `color` | `sys:color` | Pick screen color or convert color values | [color](https://getquicker.net/KC/Help/Doc/color) |
| `comment` | `sys:comment` | Comment-only step for documentation | [comment](https://getquicker.net/KC/Help/Doc/comment) |
| `compute` | `sys:compute` | Legacy numeric step (prefer sys:evalexpression) | [compute](https://getquicker.net/KC/Help/Doc/compute) |
| `computeTime` | `sys:computeTime` | Date/time arithmetic on DateTime values | [computetime](https://getquicker.net/KC/Help/Doc/computetime) |
| `continue` | `sys:continue` | Skip to next loop iteration | [continue](https://getquicker.net/KC/Help/Doc/continue) |
| `createQrCode` | `sys:createQrCode` | Encode text into a QR code image | [createqrcode](https://getquicker.net/KC/Help/Doc/createqrcode) |
| `csscript` | `sys:csscript` | Run C# script step (Exec); common for complex logic beyond evalexpression | [csscript](https://getquicker.net/KC/Help/Doc/csscript) |
| `custompanel` | `sys:custompanel` | Show custom floating action panel | [custompanel](https://getquicker.net/KC/Help/Doc/custompanel) |
| `customwindow` | `sys:customwindow` | Create/show custom WPF window UI | [customwindow](https://getquicker.net/KC/Help/Doc/customwindow) |
| `dboperation` | `sys:dboperation` | Run SQL and return results | [dboperation](https://getquicker.net/KC/Help/Doc/dboperation) |
| `delay` | `sys:delay` | Wait for specified milliseconds | [delay](https://getquicker.net/KC/Help/Doc/delay) |
| `dependencycheck` | `sys:dependencycheck` | Check and download dependency packages | [dependencycheck](https://getquicker.net/KC/Help/Doc/dependencycheck) |
| `dictOperations` | `sys:dictOperations` | Dictionary step (prefer sys:evalexpression for logic; search 词典 for this module) | [dictoperations](https://getquicker.net/KC/Help/Doc/dictoperations) |
| `download` | `sys:download` | Download file from URL | [download](https://getquicker.net/KC/Help/Doc/download) |
| `each` | `sys:each` | Iterate each item in a list | [each](https://getquicker.net/KC/Help/Doc/each) |
| `enc` | `sys:enc` | Encrypt, decrypt, or hash text/data | [enc](https://getquicker.net/KC/Help/Doc/enc) |
| `evalexpression` | `sys:evalexpression` | Evaluate C# / LINQ; batch multi-{var}= assign or complex expressions (simple assign → sys:assign) | [expression](https://getquicker.net/KC/Help/Doc/expression) |
| `everythingsearch` | `sys:everythingsearch` | Search files via Everything | [everythingsearch](https://getquicker.net/KC/Help/Doc/everythingsearch) |
| `excelObjects` | `sys:excelObjects` | Excel application/workbook/sheet object operations | [excelobjects](https://getquicker.net/KC/Help/Doc/excelobjects) |
| `excelRange` | `sys:excelRange` | Read/write Excel ranges and cells | [excelrange](https://getquicker.net/KC/Help/Doc/excelrange) |
| `excelreadwrite` | `sys:excelreadwrite` | Load/save Excel workbook files | [excelreadwrite](https://getquicker.net/KC/Help/Doc/excelreadwrite) |
| `fileOperation` | `sys:fileOperation` | File/folder copy, move, delete, etc. | [fileoperation](https://getquicker.net/KC/Help/Doc/fileoperation) |
| `fileSystemWatch` | `sys:fileSystemWatch` | Watch file create/change/delete events | [filesystemwatch](https://getquicker.net/KC/Help/Doc/filesystemwatch) |
| `fileToClipboard` | `sys:fileToClipboard` | Put files onto clipboard | [filetoclipboard](https://getquicker.net/KC/Help/Doc/filetoclipboard) |
| `flauiautomation` | `sys:flauiautomation` | UI automation via FlaUI | [uiautomation](https://getquicker.net/KC/Help/Doc/uiautomation) |
| `form` | `sys:form` | Edit multiple variables in a form | [form](https://getquicker.net/KC/Help/Doc/form) |
| `formatString` | `sys:formatString` | Combine variables into text (prefer sys:evalexpression for assign/format logic) | [formatstring](https://getquicker.net/KC/Help/Doc/formatstring) |
| `getActionInfo` | `sys:getActionInfo` | Read running or specified action info | [getactioninfo](https://getquicker.net/KC/Help/Doc/getactioninfo) |
| `getActiveProcessInfo` | `sys:getActiveProcessInfo` | Get foreground window process info | [getactiveprocessinfo](https://getquicker.net/KC/Help/Doc/getactiveprocessinfo) |
| `getChromeUrl` | `sys:getChromeUrl` | Get active browser tab URL | [getchromeurl](https://getquicker.net/KC/Help/Doc/getchromeurl) |
| `getClipboardFiles` | `sys:getClipboardFiles` | Get file paths from clipboard | [getclipboardfiles](https://getquicker.net/KC/Help/Doc/getclipboardfiles) |
| `getClipboardImage` | `sys:getClipboardImage` | Read image from clipboard | [getclipboardimage](https://getquicker.net/KC/Help/Doc/getclipboardimage) |
| `getClipboardText` | `sys:getClipboardText` | Read text from clipboard into a variable | [getclipboardtext](https://getquicker.net/KC/Help/Doc/getclipboardtext) |
| `getCurrentTime` | `sys:getCurrentTime` | Get or parse date/time (incl. unix timestamp) | [gettime](https://getquicker.net/KC/Help/Doc/gettime) |
| `getExplorerPath` | `sys:getExplorerPath` | Get Explorer current folder path | [getexplorerpath](https://getquicker.net/KC/Help/Doc/getexplorerpath) |
| `getFolderPath` | `sys:getFolderPath` | Get Windows special folder path | [getfolderpath](https://getquicker.net/KC/Help/Doc/getfolderpath) |
| `getQuickerInfo` | `sys:getQuickerInfo` | Quicker version, theme, trigger context | [getquickerinfo](https://getquicker.net/KC/Help/Doc/getquickerinfo) |
| `getSelectedFiles` | `sys:getSelectedFiles` | Get selected files/folders from Explorer or desktop | [getselectedfiles](https://getquicker.net/KC/Help/Doc/getselectedfiles) |
| `getSelectedText` | `sys:getSelectedText` | Get currently selected text | [get_selected_text](https://getquicker.net/KC/Help/Doc/get_selected_text) |
| `getSysInfo` | `sys:getSysInfo` | Read Windows/system environment info | [getsysinfo](https://getquicker.net/KC/Help/Doc/getsysinfo) |
| `getWindowTitle` | `sys:getWindowTitle` | Get window info or find window by criteria | [getwindowtitle](https://getquicker.net/KC/Help/Doc/getwindowtitle) |
| `group` | `sys:group` | Group related steps for enable/disable | [group](https://getquicker.net/KC/Help/Doc/group) |
| `htmlExtract` | `sys:htmlExtract` | Extract content from HTML | [htmlextract](https://getquicker.net/KC/Help/Doc/htmlextract) |
| `http` | `sys:http` | Send HTTP request and capture response | [http](https://getquicker.net/KC/Help/Doc/http) |
| `httpserver` | `sys:httpserver` | Start temporary local HTTP/file server | [httpserver](https://getquicker.net/KC/Help/Doc/httpserver) |
| `if` | `sys:if` | Conditional steps with optional else branch | [if](https://getquicker.net/KC/Help/Doc/if) |
| `imageinfo` | `sys:imageinfo` | Read image dimensions or EXIF metadata | [imageinfo](https://getquicker.net/KC/Help/Doc/imageinfo) |
| `imeControl` | `sys:imeControl` | Get or switch IME Chinese/English state | [imecontrol](https://getquicker.net/KC/Help/Doc/imecontrol) |
| `imgProcess` | `sys:imgProcess` | Image processing operations | [imgprocess](https://getquicker.net/KC/Help/Doc/imgprocess) |
| `imgToBase64` | `sys:imgToBase64` | Convert image/file to or from Base64 text | [imgtobase64](https://getquicker.net/KC/Help/Doc/imgtobase64) |
| `inputScript` | `sys:inputScript` | Multi-step keyboard input script | [inputscript](https://getquicker.net/KC/Help/Doc/inputscript) |
| `joinList` | `sys:joinList` | Join list items into a single text string | [joinlist](https://getquicker.net/KC/Help/Doc/joinlist) |
| `jsonExtract` | `sys:jsonExtract` | Extract fields from JSON text | [jsonextract](https://getquicker.net/KC/Help/Doc/jsonextract) |
| `jsscript` | `sys:jsscript` | Run JavaScript script step | [jsscript](https://getquicker.net/KC/Help/Doc/jsscript) |
| `keyInput` | `sys:keyInput` | Simulate keyboard typing | [keyinput](https://getquicker.net/KC/Help/Doc/keyinput) |
| `keyoperation` | `sys:keyoperation` | Query or control a single key state | [keyoperation](https://getquicker.net/KC/Help/Doc/keyoperation) |
| `listOperations` | `sys:listOperations` | List step UI modes (prefer sys:evalexpression for LINQ; search 列表操作 for this module) | [listoperations](https://getquicker.net/KC/Help/Doc/listoperations) |
| `manageList` | `sys:manageList` | Manually sort/edit list in UI | [managelist](https://getquicker.net/KC/Help/Doc/managelist) |
| `mathocr` | `sys:mathocr` | Recognize math formulas from images | [mathocr](https://getquicker.net/KC/Help/Doc/mathocr) |
| `mouse` | `sys:mouse` | Simulate mouse input | [mouse](https://getquicker.net/KC/Help/Doc/mouse) |
| `newGuid` | `sys:newGuid` | Generate a new GUID string | [newguid](https://getquicker.net/KC/Help/Doc/newguid) |
| `notify` | `sys:notify` | Transient notification message | [notify](https://getquicker.net/KC/Help/Doc/notify) |
| `numCompare` | `sys:numCompare` | Compare two numbers (legacy; prefer evalexpression for logic) | [numcompare](https://getquicker.net/KC/Help/Doc/numcompare) |
| `numberprocess` | `sys:numberprocess` | Format or convert numbers (to text, rounding, etc.) | [numberprocess](https://getquicker.net/KC/Help/Doc/numberprocess) |
| `officehelper` | `sys:officehelper` | Helper ops for Office apps (e.g. run VBA) | [officehelper](https://getquicker.net/KC/Help/Doc/officehelper) |
| `openUrl` | `sys:openUrl` | Open URL in browser | [openurl](https://getquicker.net/KC/Help/Doc/openurl) |
| `outputText` | `sys:outputText` | Output text to the active foreground window | [outputtext](https://getquicker.net/KC/Help/Doc/outputtext) |
| `pathExtraction` | `sys:pathExtraction` | Extract file name, folder, extension from paths | [pathextraction](https://getquicker.net/KC/Help/Doc/pathextraction) |
| `playRecords` | `sys:playRecords` | Replay recorded keyboard/mouse macro | [playrecord](https://getquicker.net/KC/Help/Doc/playrecord) |
| `playSound` | `sys:playSound` | Play built-in or file sound | [playsound](https://getquicker.net/KC/Help/Doc/playsound) |
| `pythonscript` | `sys:pythonscript` | Run Python script step | [pythonscript](https://getquicker.net/KC/Help/Doc/pythonscript) |
| `quickeroperations` | `sys:quickeroperations` | Invoke Quicker built-in features | [quickeroperations](https://getquicker.net/KC/Help/Doc/quickeroperations) |
| `randomNum` | `sys:randomNum` | Generate random numbers | [randomnum](https://getquicker.net/KC/Help/Doc/randomnum) |
| `readFile` | `sys:readFile` | Read text or image from file | [readfile](https://getquicker.net/KC/Help/Doc/readfile) |
| `readQrCode` | `sys:readQrCode` | Decode QR code from image | [readqrcode](https://getquicker.net/KC/Help/Doc/readqrcode) |
| `record` | `sys:record` | Record keyboard/mouse actions for replay | [record](https://getquicker.net/KC/Help/Doc/record) |
| `recordSound` | `sys:recordSound` | Record audio or run speech recognition | [recordsound](https://getquicker.net/KC/Help/Doc/recordsound) |
| `regexExtract` | `sys:regexExtract` | Extract text with regular expressions | [regexextract](https://getquicker.net/KC/Help/Doc/regexextract) |
| `repeat` | `sys:repeat` | Repeat steps N times or until condition | [repeat](https://getquicker.net/KC/Help/Doc/repeat) |
| `reportProgress` | `sys:reportProgress` | Show or update progress bar | [reportprogress](https://getquicker.net/KC/Help/Doc/reportprogress) |
| `restoreActiveWindow` | `sys:restoreActiveWindow` | Restore previous foreground window focus | [restoreactivewindow](https://getquicker.net/KC/Help/Doc/restoreactivewindow) |
| `rhinocontrol` | `sys:rhinocontrol` | Send commands/scripts to Rhino | [rhinocontrol](https://getquicker.net/KC/Help/Doc/rhinocontrol) |
| `run` | `sys:run` | Run exe, open file/folder/URL | [run](https://getquicker.net/KC/Help/Doc/run) |
| `runAction` | `sys:runAction` | Run or stop another Quicker action | [runaction](https://getquicker.net/KC/Help/Doc/runaction) |
| `runScript` | `sys:runScript` | Run PowerShell/CMD or user script file | [runscript](https://getquicker.net/KC/Help/Doc/runscript) |
| `screenCapture` | `sys:screenCapture` | Capture screen region | [screencapture](https://getquicker.net/KC/Help/Doc/screencapture) |
| `screenCapturePro` | `sys:screenCapturePro` | Interactive region screenshot | [screencapturepro](https://getquicker.net/KC/Help/Doc/screencapturepro) |
| `searchBmp` | `sys:searchBmp` | Find image/color/text on screen | [searchbmp](https://getquicker.net/KC/Help/Doc/searchbmp) |
| `select` | `sys:select` | Let user pick one option | [userselect](https://getquicker.net/KC/Help/Doc/userselect) |
| `selectFile` | `sys:selectFile` | Pick file via dialog | [selectfile](https://getquicker.net/KC/Help/Doc/selectfile) |
| `selectFolder` | `sys:selectFolder` | Pick folder via dialog | [selectfolder](https://getquicker.net/KC/Help/Doc/selectfolder) |
| `sendKeys` | `sys:sendKeys` | Send keys/text with parameters | [sendkeys](https://getquicker.net/KC/Help/Doc/sendkeys) |
| `sendMessage` | `sys:sendMessage` | Send Win32 SendMessage to a window | [sendmessage](https://getquicker.net/KC/Help/Doc/sendmessage) |
| `shelloperation` | `sys:shelloperation` | Windows Shell file operations | [shelloperation](https://getquicker.net/KC/Help/Doc/shelloperation) |
| `showImage` | `sys:showImage` | Display image on screen | [showimage](https://getquicker.net/KC/Help/Doc/showimage) |
| `showText` | `sys:showText` | Show text in a dedicated window | [showtext](https://getquicker.net/KC/Help/Doc/showtext) |
| `showWaitWin` | `sys:showWaitWin` | Show wait-for-user-operation window | [showwaitwin](https://getquicker.net/KC/Help/Doc/showwaitwin) |
| `showmenu` | `sys:showmenu` | Show a menu for user selection | [showmenu](https://getquicker.net/KC/Help/Doc/showmenu) |
| `simpleIf` | `sys:simpleIf` | Simple if without else structure | [if](https://getquicker.net/KC/Help/Doc/if) |
| `smtp` | `sys:smtp` | Send email via SMTP | [smtp](https://getquicker.net/KC/Help/Doc/smtp) |
| `splitString` | `sys:splitString` | Split text into a list by delimiter | [splitstring](https://getquicker.net/KC/Help/Doc/splitstring) |
| `stateStorage` | `sys:stateStorage` | Read/write action state and badge | [statestorage](https://getquicker.net/KC/Help/Doc/statestorage) |
| `stop` | `sys:stop` | Stop action or return from subprogram | [stop](https://getquicker.net/KC/Help/Doc/stop) |
| `strCompare` | `sys:strCompare` | Compare two text strings (legacy compare step) | [strcompare](https://getquicker.net/KC/Help/Doc/strcompare) |
| `strReplace` | `sys:strReplace` | Replace substrings in text (built-in replace modes) | [strreplace](https://getquicker.net/KC/Help/Doc/strreplace) |
| `stringProcess` | `sys:stringProcess` | Built-in string operations (prefer sys:evalexpression for logic; search 文本处理 to use this module) | [stringprocess](https://getquicker.net/KC/Help/Doc/stringprocess) |
| `subprogram` | `sys:subprogram` | Call shared or local subprogram | [subprogram](https://getquicker.net/KC/Help/Doc/subprogram) |
| `tableoperation` | `sys:tableoperation` | Table variable operations | [tableoperation](https://getquicker.net/KC/Help/Doc/tableoperation) |
| `tempImgBed` | `sys:tempImgBed` | Upload image to temporary Quicker image host | [tempimgbed](https://getquicker.net/KC/Help/Doc/tempimgbed) |
| `tempcloudstore` | `sys:tempcloudstore` | Upload temp content and get URL | [tempcloudstore](https://getquicker.net/KC/Help/Doc/tempcloudstore) |
| `textCounter` | `sys:textCounter` | Count lines, characters, words in text | [textcounter](https://getquicker.net/KC/Help/Doc/textcounter) |
| `textSelectTools` | `sys:textSelectTools` | Helper tools to select content and get text | [textselecttools](https://getquicker.net/KC/Help/Doc/textselecttools) |
| `translation` | `sys:translation` | Machine translation via third-party APIs (paid feature) | [translation](https://getquicker.net/KC/Help/Doc/translation) |
| `uiautomation` | `sys:uiautomation` | Automate Win32 UI controls | [uiautomation](https://getquicker.net/KC/Help/Doc/uiautomation) |
| `userInput` | `sys:userInput` | Prompt user for text input | [userinput](https://getquicker.net/KC/Help/Doc/userinput) |
| `waitClipboardChange` | `sys:waitClipboardChange` | Wait until clipboard content changes | [waitclipboardchange](https://getquicker.net/KC/Help/Doc/waitclipboardchange) |
| `waitKeyboard` | `sys:waitKeyboard` | Wait for user key press | [waitkeyboard](https://getquicker.net/KC/Help/Doc/waitkeyboard) |
| `websocket` | `sys:websocket` | WebSocket client operations | [websocket](https://getquicker.net/KC/Help/Doc/websocket) |
| `webview2` | `sys:webview2` | Open/control WebView2 embedded browser window | [webview2](https://getquicker.net/KC/Help/Doc/webview2) |
| `whiteboard` | `sys:whiteboard` | Hand-draw content and output as image | [whiteboard](https://getquicker.net/KC/Help/Doc/whiteboard) |
| `windowOperations` | `sys:windowOperations` | Move, resize, or change window state | [windowoperations](https://getquicker.net/KC/Help/Doc/windowoperations) |
| `winservice` | `sys:winservice` | Query Windows services or registry | [winservice](https://getquicker.net/KC/Help/Doc/winservice) |
| `writeClipboard` | `sys:writeClipboard` | Write text or image to clipboard | [writeclipboard](https://getquicker.net/KC/Help/Doc/writeclipboard) |
| `zip` | `sys:zip` | Zip compress or extract archive | [zip](https://getquicker.net/KC/Help/Doc/zip) |

## KC 爬取 reference（全文）

### 程序流控制

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `kc/break` | `sys:break` | Break out of each/repeat loop | [break](https://getquicker.net/KC/Help/Doc/break) |
| `kc/continue` | `sys:continue` | Skip to next loop iteration | [continue](https://getquicker.net/KC/Help/Doc/continue) |
| `kc/dependencycheck` | `sys:dependencycheck` | Check and download dependency packages | [dependencycheck](https://getquicker.net/KC/Help/Doc/dependencycheck) |
| `kc/each` | `sys:each` | Iterate each item in a list | [each](https://getquicker.net/KC/Help/Doc/each) |
| `kc/group` | `sys:group` | Group related steps for enable/disable | [group](https://getquicker.net/KC/Help/Doc/group) |
| `kc/if` | `sys:if` | Conditional steps with optional else branch | [if](https://getquicker.net/KC/Help/Doc/if) |
| `kc/repeat` | `sys:repeat` | Repeat steps N times or until condition | [repeat](https://getquicker.net/KC/Help/Doc/repeat) |
| `kc/runAction` | `sys:runAction` | Run or stop another Quicker action | [runaction](https://getquicker.net/KC/Help/Doc/runaction) |
| `kc/simpleIf` | `sys:simpleIf` | Simple if without else structure | [if](https://getquicker.net/KC/Help/Doc/if) |
| `kc/stop` | `sys:stop` | Stop action or return from subprogram | [stop](https://getquicker.net/KC/Help/Doc/stop) |
| `kc/subprogram` | `sys:subprogram` | Call shared or local subprogram | [subprogram](https://getquicker.net/KC/Help/Doc/subprogram) |

### 常用基础

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `kc/comment` | `sys:comment` | Comment-only step for documentation | [comment](https://getquicker.net/KC/Help/Doc/comment) |
| `kc/delay` | `sys:delay` | Wait for specified milliseconds | [delay](https://getquicker.net/KC/Help/Doc/delay) |
| `kc/getSelectedText` | `sys:getSelectedText` | Get currently selected text | [get_selected_text](https://getquicker.net/KC/Help/Doc/get_selected_text) |
| `kc/inputScript` | `sys:inputScript` | Multi-step keyboard input script | [inputscript](https://getquicker.net/KC/Help/Doc/inputscript) |
| `kc/keyInput` | `sys:keyInput` | Simulate keyboard typing | [keyinput](https://getquicker.net/KC/Help/Doc/keyinput) |
| `kc/mouse` | `sys:mouse` | Simulate mouse input | [mouse](https://getquicker.net/KC/Help/Doc/mouse) |
| `kc/MsgBox` | `sys:MsgBox` | Show message or confirmation dialog | [msgbox](https://getquicker.net/KC/Help/Doc/msgbox) |
| `kc/notify` | `sys:notify` | Transient notification message | [notify](https://getquicker.net/KC/Help/Doc/notify) |
| `kc/openUrl` | `sys:openUrl` | Open URL in browser | [openurl](https://getquicker.net/KC/Help/Doc/openurl) |
| `kc/outputText` | `sys:outputText` | Output text to the active foreground window | [outputtext](https://getquicker.net/KC/Help/Doc/outputtext) |
| `kc/playRecords` | `sys:playRecords` | Replay recorded keyboard/mouse macro | [playrecord](https://getquicker.net/KC/Help/Doc/playrecord) |
| `kc/record` | `sys:record` | Record keyboard/mouse actions for replay | [record](https://getquicker.net/KC/Help/Doc/record) |
| `kc/run` | `sys:run` | Run exe, open file/folder/URL | [run](https://getquicker.net/KC/Help/Doc/run) |
| `kc/sendKeys` | `sys:sendKeys` | Send keys/text with parameters | [sendkeys](https://getquicker.net/KC/Help/Doc/sendkeys) |
| `kc/waitClipboardChange` | `sys:waitClipboardChange` | Wait until clipboard content changes | [waitclipboardchange](https://getquicker.net/KC/Help/Doc/waitclipboardchange) |
| `kc/waitKeyboard` | `sys:waitKeyboard` | Wait for user key press | [waitkeyboard](https://getquicker.net/KC/Help/Doc/waitkeyboard) |

### 界面交互

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `kc/custompanel` | `sys:custompanel` | Show custom floating action panel | [custompanel](https://getquicker.net/KC/Help/Doc/custompanel) |
| `kc/customwindow` | `sys:customwindow` | Create/show custom WPF window UI | [customwindow](https://getquicker.net/KC/Help/Doc/customwindow) |
| `kc/form` | `sys:form` | Edit multiple variables in a form | [form](https://getquicker.net/KC/Help/Doc/form) |
| `kc/reportProgress` | `sys:reportProgress` | Show or update progress bar | [reportprogress](https://getquicker.net/KC/Help/Doc/reportprogress) |
| `kc/select` | `sys:select` | Let user pick one option | [userselect](https://getquicker.net/KC/Help/Doc/userselect) |
| `kc/showImage` | `sys:showImage` | Display image on screen | [showimage](https://getquicker.net/KC/Help/Doc/showimage) |
| `kc/showmenu` | `sys:showmenu` | Show a menu for user selection | [showmenu](https://getquicker.net/KC/Help/Doc/showmenu) |
| `kc/showText` | `sys:showText` | Show text in a dedicated window | [showtext](https://getquicker.net/KC/Help/Doc/showtext) |
| `kc/showWaitWin` | `sys:showWaitWin` | Show wait-for-user-operation window | [showwaitwin](https://getquicker.net/KC/Help/Doc/showwaitwin) |
| `kc/textSelectTools` | `sys:textSelectTools` | Helper tools to select content and get text | [textselecttools](https://getquicker.net/KC/Help/Doc/textselecttools) |
| `kc/userInput` | `sys:userInput` | Prompt user for text input | [userinput](https://getquicker.net/KC/Help/Doc/userinput) |
| `kc/whiteboard` | `sys:whiteboard` | Hand-draw content and output as image | [whiteboard](https://getquicker.net/KC/Help/Doc/whiteboard) |

### 剪贴板

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `kc/fileToClipboard` | `sys:fileToClipboard` | Put files onto clipboard | [filetoclipboard](https://getquicker.net/KC/Help/Doc/filetoclipboard) |
| `kc/getClipboardFiles` | `sys:getClipboardFiles` | Get file paths from clipboard | [getclipboardfiles](https://getquicker.net/KC/Help/Doc/getclipboardfiles) |
| `kc/getClipboardImage` | `sys:getClipboardImage` | Read image from clipboard | [getclipboardimage](https://getquicker.net/KC/Help/Doc/getclipboardimage) |
| `kc/getClipboardText` | `sys:getClipboardText` | Read text from clipboard into a variable | [getclipboardtext](https://getquicker.net/KC/Help/Doc/getclipboardtext) |
| `kc/writeClipboard` | `sys:writeClipboard` | Write text or image to clipboard | [writeclipboard](https://getquicker.net/KC/Help/Doc/writeclipboard) |

### 文件与目录

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `kc/checkPathExists` | `sys:checkPathExists` | Check if file/folder exists; optional file metadata | [checkpathexists](https://getquicker.net/KC/Help/Doc/checkpathexists) |
| `kc/everythingsearch` | `sys:everythingsearch` | Search files via Everything | [everythingsearch](https://getquicker.net/KC/Help/Doc/everythingsearch) |
| `kc/fileOperation` | `sys:fileOperation` | File/folder copy, move, delete, etc. | [fileoperation](https://getquicker.net/KC/Help/Doc/fileoperation) |
| `kc/fileSystemWatch` | `sys:fileSystemWatch` | Watch file create/change/delete events | [filesystemwatch](https://getquicker.net/KC/Help/Doc/filesystemwatch) |
| `kc/GenTempFilePath` | `sys:GenTempFilePath` | Generate random temp file path | [gentempfilepath](https://getquicker.net/KC/Help/Doc/gentempfilepath) |
| `kc/getExplorerPath` | `sys:getExplorerPath` | Get Explorer current folder path | [getexplorerpath](https://getquicker.net/KC/Help/Doc/getexplorerpath) |
| `kc/getFolderPath` | `sys:getFolderPath` | Get Windows special folder path | [getfolderpath](https://getquicker.net/KC/Help/Doc/getfolderpath) |
| `kc/pathExtraction` | `sys:pathExtraction` | Extract file name, folder, extension from paths | [pathextraction](https://getquicker.net/KC/Help/Doc/pathextraction) |
| `kc/readFile` | `sys:readFile` | Read text or image from file | [readfile](https://getquicker.net/KC/Help/Doc/readfile) |
| `kc/selectFile` | `sys:selectFile` | Pick file via dialog | [selectfile](https://getquicker.net/KC/Help/Doc/selectfile) |
| `kc/SelectFileInExplorer` | `sys:SelectFileInExplorer` | Select/highlight file in Explorer | [selectfileinexplorer](https://getquicker.net/KC/Help/Doc/selectfileinexplorer) |
| `kc/selectFolder` | `sys:selectFolder` | Pick folder via dialog | [selectfolder](https://getquicker.net/KC/Help/Doc/selectfolder) |
| `kc/shelloperation` | `sys:shelloperation` | Windows Shell file operations | [shelloperation](https://getquicker.net/KC/Help/Doc/shelloperation) |
| `kc/stateStorage` | `sys:stateStorage` | Read/write action state and badge | [statestorage](https://getquicker.net/KC/Help/Doc/statestorage) |
| `kc/WriteTextFile` | `sys:WriteTextFile` | Write text to a file | [writetextfile](https://getquicker.net/KC/Help/Doc/writetextfile) |
| `kc/zip` | `sys:zip` | Zip compress or extract archive | [zip](https://getquicker.net/KC/Help/Doc/zip) |

### 文本处理

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `kc/charInfo` | `sys:charInfo` | Get character metadata (category, code point, etc.) | [charinfo](https://getquicker.net/KC/Help/Doc/charinfo) |
| `kc/formatString` | `sys:formatString` | Combine variables into text (prefer sys:evalexpression for assign/format logic) | [formatstring](https://getquicker.net/KC/Help/Doc/formatstring) |
| `kc/htmlExtract` | `sys:htmlExtract` | Extract content from HTML | [htmlextract](https://getquicker.net/KC/Help/Doc/htmlextract) |
| `kc/joinList` | `sys:joinList` | Join list items into a single text string | [joinlist](https://getquicker.net/KC/Help/Doc/joinlist) |
| `kc/jsonExtract` | `sys:jsonExtract` | Extract fields from JSON text | [jsonextract](https://getquicker.net/KC/Help/Doc/jsonextract) |
| `kc/regexExtract` | `sys:regexExtract` | Extract text with regular expressions | [regexextract](https://getquicker.net/KC/Help/Doc/regexextract) |
| `kc/splitString` | `sys:splitString` | Split text into a list by delimiter | [splitstring](https://getquicker.net/KC/Help/Doc/splitstring) |
| `kc/strCompare` | `sys:strCompare` | Compare two text strings (legacy compare step) | [strcompare](https://getquicker.net/KC/Help/Doc/strcompare) |
| `kc/stringProcess` | `sys:stringProcess` | Built-in string operations (prefer sys:evalexpression for logic; search 文本处理 to use this module) | [stringprocess](https://getquicker.net/KC/Help/Doc/stringprocess) |
| `kc/strReplace` | `sys:strReplace` | Replace substrings in text (built-in replace modes) | [strreplace](https://getquicker.net/KC/Help/Doc/strreplace) |
| `kc/textCounter` | `sys:textCounter` | Count lines, characters, words in text | [textcounter](https://getquicker.net/KC/Help/Doc/textcounter) |
| `kc/translation` | `sys:translation` | Machine translation via third-party APIs (paid feature) | [translation](https://getquicker.net/KC/Help/Doc/translation) |

### 计算与数据结构

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `kc/assign` | `sys:assign` | Assign value to action variable (literal, $$, $=, or input.var copy); default for single-var writes | [assign](https://getquicker.net/KC/Help/Doc/assign) |
| `kc/color` | `sys:color` | Pick screen color or convert color values | [color](https://getquicker.net/KC/Help/Doc/color) |
| `kc/compute` | `sys:compute` | Legacy numeric step (prefer sys:evalexpression) | [compute](https://getquicker.net/KC/Help/Doc/compute) |
| `kc/computeTime` | `sys:computeTime` | Date/time arithmetic on DateTime values | [computetime](https://getquicker.net/KC/Help/Doc/computetime) |
| `kc/dboperation` | `sys:dboperation` | Run SQL and return results | [dboperation](https://getquicker.net/KC/Help/Doc/dboperation) |
| `kc/dictOperations` | `sys:dictOperations` | Dictionary step (prefer sys:evalexpression for logic; search 词典 for this module) | [dictoperations](https://getquicker.net/KC/Help/Doc/dictoperations) |
| `kc/enc` | `sys:enc` | Encrypt, decrypt, or hash text/data | [enc](https://getquicker.net/KC/Help/Doc/enc) |
| `kc/evalexpression` | `sys:evalexpression` | Evaluate C# / LINQ; batch multi-{var}= assign or complex expressions (simple assign → sys:assign) | [expression](https://getquicker.net/KC/Help/Doc/expression) |
| `kc/getCurrentTime` | `sys:getCurrentTime` | Get or parse date/time (incl. unix timestamp) | [gettime](https://getquicker.net/KC/Help/Doc/gettime) |
| `kc/listOperations` | `sys:listOperations` | List step UI modes (prefer sys:evalexpression for LINQ; search 列表操作 for this module) | [listoperations](https://getquicker.net/KC/Help/Doc/listoperations) |
| `kc/manageList` | `sys:manageList` | Manually sort/edit list in UI | [managelist](https://getquicker.net/KC/Help/Doc/managelist) |
| `kc/newGuid` | `sys:newGuid` | Generate a new GUID string | [newguid](https://getquicker.net/KC/Help/Doc/newguid) |
| `kc/numberprocess` | `sys:numberprocess` | Format or convert numbers (to text, rounding, etc.) | [numberprocess](https://getquicker.net/KC/Help/Doc/numberprocess) |
| `kc/numCompare` | `sys:numCompare` | Compare two numbers (legacy; prefer evalexpression for logic) | [numcompare](https://getquicker.net/KC/Help/Doc/numcompare) |
| `kc/randomNum` | `sys:randomNum` | Generate random numbers | [randomnum](https://getquicker.net/KC/Help/Doc/randomnum) |
| `kc/tableoperation` | `sys:tableoperation` | Table variable operations | [tableoperation](https://getquicker.net/KC/Help/Doc/tableoperation) |

### 图片

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `kc/basic-ocr` | `sys:basic-ocr` | OCR text from image | [basic-ocr](https://getquicker.net/KC/Help/Doc/basic-ocr) |
| `kc/createQrCode` | `sys:createQrCode` | Encode text into a QR code image | [createqrcode](https://getquicker.net/KC/Help/Doc/createqrcode) |
| `kc/imageinfo` | `sys:imageinfo` | Read image dimensions or EXIF metadata | [imageinfo](https://getquicker.net/KC/Help/Doc/imageinfo) |
| `kc/imgProcess` | `sys:imgProcess` | Image processing operations | [imgprocess](https://getquicker.net/KC/Help/Doc/imgprocess) |
| `kc/imgToBase64` | `sys:imgToBase64` | Convert image/file to or from Base64 text | [imgtobase64](https://getquicker.net/KC/Help/Doc/imgtobase64) |
| `kc/mathocr` | `sys:mathocr` | Recognize math formulas from images | [mathocr](https://getquicker.net/KC/Help/Doc/mathocr) |
| `kc/readQrCode` | `sys:readQrCode` | Decode QR code from image | [readqrcode](https://getquicker.net/KC/Help/Doc/readqrcode) |
| `kc/screenCapture` | `sys:screenCapture` | Capture screen region | [screencapture](https://getquicker.net/KC/Help/Doc/screencapture) |
| `kc/screenCapturePro` | `sys:screenCapturePro` | Interactive region screenshot | [screencapturepro](https://getquicker.net/KC/Help/Doc/screencapturepro) |
| `kc/searchBmp` | `sys:searchBmp` | Find image/color/text on screen | [searchbmp](https://getquicker.net/KC/Help/Doc/searchbmp) |
| `kc/WriteImageFile` | `sys:WriteImageFile` | Write image variable to file | [writeimagefile](https://getquicker.net/KC/Help/Doc/writeimagefile) |

### 系统与窗口

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `kc/activateProcessMainWindow` | `sys:activateProcessMainWindow` | Bring process main window to front | [activateprocessmainwindow](https://getquicker.net/KC/Help/Doc/activateprocessmainwindow) |
| `kc/audioControl` | `sys:audioControl` | List or set default audio output devices | [audiocontrol](https://getquicker.net/KC/Help/Doc/audiocontrol) |
| `kc/checkProcessExists` | `sys:checkProcessExists` | Check if process is running | [checkprocessexists](https://getquicker.net/KC/Help/Doc/checkprocessexists) |
| `kc/flauiautomation` | `sys:flauiautomation` | UI automation via FlaUI | [uiautomation](https://getquicker.net/KC/Help/Doc/uiautomation) |
| `kc/getActionInfo` | `sys:getActionInfo` | Read running or specified action info | [getactioninfo](https://getquicker.net/KC/Help/Doc/getactioninfo) |
| `kc/getActiveProcessInfo` | `sys:getActiveProcessInfo` | Get foreground window process info | [getactiveprocessinfo](https://getquicker.net/KC/Help/Doc/getactiveprocessinfo) |
| `kc/getQuickerInfo` | `sys:getQuickerInfo` | Quicker version, theme, trigger context | [getquickerinfo](https://getquicker.net/KC/Help/Doc/getquickerinfo) |
| `kc/getSelectedFiles` | `sys:getSelectedFiles` | Get selected files/folders from Explorer or desktop | [getselectedfiles](https://getquicker.net/KC/Help/Doc/getselectedfiles) |
| `kc/getSysInfo` | `sys:getSysInfo` | Read Windows/system environment info | [getsysinfo](https://getquicker.net/KC/Help/Doc/getsysinfo) |
| `kc/getWindowTitle` | `sys:getWindowTitle` | Get window info or find window by criteria | [getwindowtitle](https://getquicker.net/KC/Help/Doc/getwindowtitle) |
| `kc/imeControl` | `sys:imeControl` | Get or switch IME Chinese/English state | [imecontrol](https://getquicker.net/KC/Help/Doc/imecontrol) |
| `kc/keyoperation` | `sys:keyoperation` | Query or control a single key state | [keyoperation](https://getquicker.net/KC/Help/Doc/keyoperation) |
| `kc/playSound` | `sys:playSound` | Play built-in or file sound | [playsound](https://getquicker.net/KC/Help/Doc/playsound) |
| `kc/quickeroperations` | `sys:quickeroperations` | Invoke Quicker built-in features | [quickeroperations](https://getquicker.net/KC/Help/Doc/quickeroperations) |
| `kc/recordSound` | `sys:recordSound` | Record audio or run speech recognition | [recordsound](https://getquicker.net/KC/Help/Doc/recordsound) |
| `kc/restoreActiveWindow` | `sys:restoreActiveWindow` | Restore previous foreground window focus | [restoreactivewindow](https://getquicker.net/KC/Help/Doc/restoreactivewindow) |
| `kc/sendMessage` | `sys:sendMessage` | Send Win32 SendMessage to a window | [sendmessage](https://getquicker.net/KC/Help/Doc/sendmessage) |
| `kc/uiautomation` | `sys:uiautomation` | Automate Win32 UI controls | [uiautomation](https://getquicker.net/KC/Help/Doc/uiautomation) |
| `kc/windowOperations` | `sys:windowOperations` | Move, resize, or change window state | [windowoperations](https://getquicker.net/KC/Help/Doc/windowoperations) |
| `kc/winservice` | `sys:winservice` | Query Windows services or registry | [winservice](https://getquicker.net/KC/Help/Doc/winservice) |

### 网络与云服务

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `kc/ai` | `sys:ai` | Call third-party AI services | [ai](https://getquicker.net/KC/Help/Doc/ai) |
| `kc/cloud_oss` | `sys:cloud_oss` | Upload files via third-party cloud/OSS providers | [cloud_oss](https://getquicker.net/KC/Help/Doc/cloud_oss) |
| `kc/clouddata` | `sys:clouddata` | Read/write Quicker cloud key-value state | [clouddata](https://getquicker.net/KC/Help/Doc/clouddata) |
| `kc/download` | `sys:download` | Download file from URL | [download](https://getquicker.net/KC/Help/Doc/download) |
| `kc/http` | `sys:http` | Send HTTP request and capture response | [http](https://getquicker.net/KC/Help/Doc/http) |
| `kc/httpserver` | `sys:httpserver` | Start temporary local HTTP/file server | [httpserver](https://getquicker.net/KC/Help/Doc/httpserver) |
| `kc/smtp` | `sys:smtp` | Send email via SMTP | [smtp](https://getquicker.net/KC/Help/Doc/smtp) |
| `kc/tempcloudstore` | `sys:tempcloudstore` | Upload temp content and get URL | [tempcloudstore](https://getquicker.net/KC/Help/Doc/tempcloudstore) |
| `kc/tempImgBed` | `sys:tempImgBed` | Upload image to temporary Quicker image host | [tempimgbed](https://getquicker.net/KC/Help/Doc/tempimgbed) |
| `kc/websocket` | `sys:websocket` | WebSocket client operations | [websocket](https://getquicker.net/KC/Help/Doc/websocket) |
| `kc/webview2` | `sys:webview2` | Open/control WebView2 embedded browser window | [webview2](https://getquicker.net/KC/Help/Doc/webview2) |

### 脚本与代码

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `kc/csscript` | `sys:csscript` | Run C# script step (Exec); common for complex logic beyond evalexpression | [csscript](https://getquicker.net/KC/Help/Doc/csscript) |
| `kc/jsscript` | `sys:jsscript` | Run JavaScript script step | [jsscript](https://getquicker.net/KC/Help/Doc/jsscript) |
| `kc/pythonscript` | `sys:pythonscript` | Run Python script step | [pythonscript](https://getquicker.net/KC/Help/Doc/pythonscript) |
| `kc/runScript` | `sys:runScript` | Run PowerShell/CMD or user script file | [runscript](https://getquicker.net/KC/Help/Doc/runscript) |

### 第三方软件

| ref id | key | 用途 | 官方 |
|--------|-----|------|------|
| `kc/adobesoftscontrol` | `sys:adobesoftscontrol` | Control Adobe apps (JS script, etc.) | [adobesoftscontrol](https://getquicker.net/KC/Help/Doc/adobesoftscontrol) |
| `kc/autocadcontrol` | `sys:autocadcontrol` | Send commands to AutoCAD | [autocadcontrol](https://getquicker.net/KC/Help/Doc/autocadcontrol) |
| `kc/chromecontrol` | `sys:chromecontrol` | Control Chrome/Edge/Firefox (open URL, tabs, etc.) | [chromecontrol](https://getquicker.net/KC/Help/Doc/chromecontrol) |
| `kc/excelObjects` | `sys:excelObjects` | Excel application/workbook/sheet object operations | [excelobjects](https://getquicker.net/KC/Help/Doc/excelobjects) |
| `kc/excelRange` | `sys:excelRange` | Read/write Excel ranges and cells | [excelrange](https://getquicker.net/KC/Help/Doc/excelrange) |
| `kc/excelreadwrite` | `sys:excelreadwrite` | Load/save Excel workbook files | [excelreadwrite](https://getquicker.net/KC/Help/Doc/excelreadwrite) |
| `kc/getChromeUrl` | `sys:getChromeUrl` | Get active browser tab URL | [getchromeurl](https://getquicker.net/KC/Help/Doc/getchromeurl) |
| `kc/officehelper` | `sys:officehelper` | Helper ops for Office apps (e.g. run VBA) | [officehelper](https://getquicker.net/KC/Help/Doc/officehelper) |
| `kc/rhinocontrol` | `sys:rhinocontrol` | Send commands/scripts to Rhino | [rhinocontrol](https://getquicker.net/KC/Help/Doc/rhinocontrol) |

## 仅 step-runner get（无 reference 文件）

| key | 用途 | 官方 |
|-----|------|------|

## 建议优先读 reference 的模块

| 场景 | key | ref id |
|------|-----|--------|
| 多步骤输入 DSL | `sys:inputScript` | `inputScript` |
| HTTP / API / SSE | `sys:http` | `http` |
| 文件多操作 | `sys:fileOperation` | `fileOperation` |
| 文本多模式 | `sys:stringProcess` | `stringProcess` |
| 子程序 | `sys:subprogram` | `subprogram` |
| 复杂 C# / 脚本 | `sys:csscript` | `csscript` |
| UI 自动化 | `sys:uiautomation` | `uiautomation` |
| 浏览器 | `sys:chromecontrol` | `chromecontrol` |
| 多字段表单 | `sys:form` | **`form-spec`**（步骤示例见 `form` ref） |
| WebView2 自定义页 | `sys:webview2` | `webview2` |
| AI 调用 | `sys:ai` | `ai` |

全部有 reference 的模块均在 **`authored/`**（无 KC 爬取并存）。

表达式/LINQ/剪贴板/弹窗等：**`expressions`** + **`get`** 即可，无 reference。

## 相关

`step-runner-search` · `step-runner-get` · `implementation-fallback` · `expressions` · `authoring-workflow`
