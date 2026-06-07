/** Mirrors Quicker.Modules.TextTools.TextToolType (Display names from desktop). */
export type TextToolCatalogItem = {
  value: string;
  label: string;
};

export const TEXT_TOOL_CATALOG: readonly TextToolCatalogItem[] = [
  { value: "EditInCodeWindow", label: "在编辑器中修改" },
  { value: "SelectSingleFile", label: "选择一个文件" },
  { value: "SelectMultiFile", label: "选择多个文件" },
  { value: "SelectSingleFolder", label: "选择文件夹" },
  { value: "SelectProcessPath", label: "选择窗口并获取进程的路径" },
  { value: "SelectProcessName", label: "选择窗口并获取进程名称" },
  { value: "SelectWindowTitle", label: "选择窗口并获取标题" },
  { value: "SelectWindowClass", label: "选择窗口并获取其类名" },
  { value: "SelectLocationPoint", label: "选择屏幕位置" },
  { value: "SelectLocationArea", label: "选择屏幕区域" },
  { value: "SelectColor", label: "选择屏幕颜色" },
  { value: "ColorPicker", label: "选择颜色(#RRGGBB)" },
  { value: "ColorPickerArgb", label: "选择颜色(#AARRGGBB)" },
  { value: "CaptureToFile", label: "截图" },
  { value: "SelectIcon", label: "选择图标" },
  { value: "SelectKeyName", label: "输入并获取键名" },
  { value: "SelectSendKeysData", label: "输入并获取'模拟按键B'的值" },
  { value: "SelectKeyCode", label: "输入并获取虚拟键码数字" },
  { value: "SelectActionId", label: "选择动作ID" },
  { value: "SelectActionName", label: "选择动作名称" },
  { value: "SelectControlXPath", label: "选择控件XPath" },
  { value: "BoolExpressionHelper", label: "布尔表达式助手" },
  { value: "SelectSavePath", label: "选择保存路径" },
  { value: "SelectWindowHandle", label: "选择窗口句柄" },
  { value: "SelectProfileExe", label: "选择场景标识" },
  { value: "OperationItemEditor", label: "操作项编辑器" },
  { value: "SelectBluetoothDevice", label: "选择蓝牙设备" },
  { value: "SelectBluetoothLEDevice", label: "选择蓝牙低功耗设备" },
  { value: "SelectNetworkProfile", label: "选择网络连接" },
  { value: "SelectRelativePoint", label: "选择窗口位置" },
  { value: "SelectWebElementSelector", label: "获取网页元素CSS选择器" },
  { value: "Custom", label: "子程序选择工具" },
  { value: "ExtraSelectMenu", label: "扩展选择菜单" },
] as const;

export function parseTextToolsValue(raw: string): string[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export function serializeTextToolsValue(selected: readonly string[]): string {
  return selected.join(",");
}
