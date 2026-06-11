using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using Quicker.Domain;
using Quicker.Domain.Actions.X.Storage;
using Quicker.Public.Forms;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Catalog of trigger event types. Prefers the live <c>TriggerManageService</c> watcher services
/// (Debug name lookup + Release signature scan, see <c>quicker-exe-type-probing</c>);
/// falls back to an embedded static catalog when reflection fails.
/// </summary>
internal static class TriggerEventCatalog
{
    public const string SourceRuntime = "runtime";
    public const string SourceStatic = "static";

    public static (IReadOnlyList<QuickerRpcTriggerEventTypeInfo> Items, string Source) GetEventTypes()
    {
        try
        {
            var runtime = TryBuildRuntimeCatalog();
            if (runtime is { Count: > 0 })
            {
                return (runtime, SourceRuntime);
            }
        }
        catch
        {
            // fall back to the static catalog below
        }

        return (StaticCatalog.Value, SourceStatic);
    }

    public static ISet<string> GetKnownEventTypes()
    {
        var (items, _) = GetEventTypes();
        return new HashSet<string>(items.Select(i => i.EventType), StringComparer.Ordinal);
    }

    private static IReadOnlyList<QuickerRpcTriggerEventTypeInfo>? TryBuildRuntimeCatalog()
    {
        if (!QuickerInternalAccess.IsInQuicker)
        {
            return null;
        }

        var iface = ResolveTriggerServiceInterface();
        if (iface is null)
        {
            return null;
        }

        var manager = ResolveTriggerManager(iface);
        if (manager is null)
        {
            return null;
        }

        if (FindServicesList(manager, iface) is not IEnumerable services)
        {
            return null;
        }

        // Release obfuscation strips interface property metadata; fall back to the bare getter method.
        var bindingEvents = (MethodInfo?)iface.GetProperties()
                .FirstOrDefault(p => p.PropertyType == typeof(string[]))?.GetGetMethod(nonPublic: true)
            ?? iface.GetMethods()
                .FirstOrDefault(m => m.ReturnType == typeof(string[]) && m.GetParameters().Length == 0);
        var getDescription = FindInterfaceMethod(iface, typeof(string), typeof(string));
        var getFormFields = FindInterfaceMethod(iface, typeof(IList<FormField>), typeof(string));
        var getDefaultValues = FindInterfaceMethod(iface, typeof(IDictionary<string, object>), typeof(string));
        var getEventVariables = FindInterfaceMethod(iface, typeof(IList<ActionVariable>), typeof(string));
        if (bindingEvents is null || getFormFields is null)
        {
            return null;
        }

        var items = new List<QuickerRpcTriggerEventTypeInfo>();
        foreach (var service in services)
        {
            if (service is null || bindingEvents.Invoke(service, null) is not string[] events)
            {
                continue;
            }

            foreach (var eventType in events)
            {
                if (string.IsNullOrWhiteSpace(eventType))
                {
                    continue;
                }

                items.Add(BuildEventInfo(
                    service, eventType, getDescription, getFormFields, getDefaultValues, getEventVariables));
            }
        }

        return items;
    }

    private static QuickerRpcTriggerEventTypeInfo BuildEventInfo(
        object service,
        string eventType,
        MethodInfo? getDescription,
        MethodInfo getFormFields,
        MethodInfo? getDefaultValues,
        MethodInfo? getEventVariables)
    {
        var info = new QuickerRpcTriggerEventTypeInfo
        {
            EventType = eventType,
            Description = TryInvoke(() => getDescription?.Invoke(service, new object[] { eventType }) as string),
        };

        var defaults = TryInvoke(() =>
            getDefaultValues?.Invoke(service, new object[] { eventType }) as IDictionary<string, object>);

        var fields = TryInvoke(() =>
            getFormFields.Invoke(service, new object[] { eventType }) as IList<FormField>);
        if (fields is not null)
        {
            foreach (var field in fields)
            {
                if (field is null || string.IsNullOrWhiteSpace(field.FieldKey))
                {
                    continue;
                }

                string? defaultJson = null;
                if (defaults is not null && defaults.TryGetValue(field.FieldKey, out var defaultValue))
                {
                    defaultJson = TryInvoke(() => JsonSerializer.Serialize(NormalizeValue(defaultValue)));
                }

                info.Fields.Add(new QuickerRpcTriggerEventFieldInfo
                {
                    Key = field.FieldKey,
                    Label = field.Label,
                    HelpText = field.HelpText,
                    Type = field.DictVarType?.ToString(),
                    InputMethod = field.InputMethod.ToString(),
                    SelectionItems = field.SelectionItems,
                    IsRequired = field.IsRequired,
                    DefaultValueJson = defaultJson,
                });
            }
        }

        var variables = TryInvoke(() =>
            getEventVariables?.Invoke(service, new object[] { eventType }) as IList<ActionVariable>);
        if (variables is not null)
        {
            foreach (var variable in variables)
            {
                if (variable is null || string.IsNullOrWhiteSpace(variable.Key))
                {
                    continue;
                }

                info.Variables.Add(new QuickerRpcTriggerEventVariableInfo
                {
                    Key = variable.Key,
                    Type = variable.Type.ToString(),
                    Description = variable.Desc,
                });
            }
        }

        return info;
    }

    internal static object? NormalizeValue(object? value)
    {
        if (value is null or string or bool)
        {
            return value;
        }

        var type = value.GetType();
        if (type.IsPrimitive || value is decimal)
        {
            return value;
        }

        if (type.IsEnum)
        {
            return value.ToString();
        }

        return value.ToString();
    }

    private static T? TryInvoke<T>(Func<T?> func)
    {
        try
        {
            return func();
        }
        catch
        {
            return default;
        }
    }

    /// <summary>The internal ITriggerService interface: unique interface with a (string) -> IList&lt;FormField&gt; method.</summary>
    private static Type? ResolveTriggerServiceInterface()
    {
        var assembly = typeof(AppState).Assembly;
        var matches = QuickerAssemblyReflection.EnumerateTypes(assembly)
            .Where(t => t.IsInterface && t
                .GetMethods()
                .Any(m =>
                    m.ReturnType == typeof(IList<FormField>)
                    && m.GetParameters().Length == 1
                    && m.GetParameters()[0].ParameterType == typeof(string)))
            .ToList();

        return matches.Count == 1 ? matches[0] : null;
    }

    /// <summary>
    /// AppState.TriggerManageService by Debug name, else by signature: the AppState static property
    /// or field (Release obfuscation turns the internal auto-property into a bare field) whose type
    /// holds an IList&lt;ITriggerService&gt; field.
    /// </summary>
    private static object? ResolveTriggerManager(Type serviceInterface)
    {
        var byName = QuickerInternalAccess.TryGetAppStateStaticProperty("TriggerManageService");
        if (byName is not null)
        {
            return byName;
        }

        var listType = typeof(IList<>).MakeGenericType(serviceInterface);

        bool IsManagerType(Type type) =>
            type.IsClass
            && type != typeof(string)
            && type
                .GetFields(QuickerAssemblyReflection.InstanceFlags)
                .Any(f => listType.IsAssignableFrom(f.FieldType));

        foreach (var property in typeof(AppState).GetProperties(QuickerAssemblyReflection.StaticFlags))
        {
            if (!IsManagerType(property.PropertyType))
            {
                continue;
            }

            try
            {
                var value = property.GetValue(null);
                if (value is not null)
                {
                    return value;
                }
            }
            catch
            {
                // try next candidate
            }
        }

        foreach (var field in typeof(AppState).GetFields(QuickerAssemblyReflection.StaticFlags))
        {
            if (!IsManagerType(field.FieldType))
            {
                continue;
            }

            try
            {
                var value = field.GetValue(null);
                if (value is not null)
                {
                    return value;
                }
            }
            catch
            {
                // try next candidate
            }
        }

        return null;
    }

    private static object? FindServicesList(object manager, Type serviceInterface)
    {
        var listType = typeof(IList<>).MakeGenericType(serviceInterface);
        var field = manager.GetType()
            .GetFields(QuickerAssemblyReflection.InstanceFlags)
            .FirstOrDefault(f => listType.IsAssignableFrom(f.FieldType));
        return field?.GetValue(manager);
    }

    private static MethodInfo? FindInterfaceMethod(Type iface, Type returnType, Type parameterType) =>
        iface.GetMethods().FirstOrDefault(m =>
            m.ReturnType == returnType
            && m.GetParameters().Length == 1
            && m.GetParameters()[0].ParameterType == parameterType);

    private static readonly Lazy<IReadOnlyList<QuickerRpcTriggerEventTypeInfo>> StaticCatalog = new(BuildStaticCatalog);

    /// <summary>Fallback catalog derived from Quicker trigger watcher sources. Wire keys are exact (incl. legacy typos).</summary>
    private static IReadOnlyList<QuickerRpcTriggerEventTypeInfo> BuildStaticCatalog()
    {
        QuickerRpcTriggerEventFieldInfo F(string key, string type, string? label = null, string? help = null) => new()
        {
            Key = key,
            Type = type,
            Label = label ?? key,
            HelpText = help,
        };

        QuickerRpcTriggerEventTypeInfo E(string eventType, string description, params QuickerRpcTriggerEventFieldInfo[] fields) => new()
        {
            EventType = eventType,
            Description = description,
            Fields = fields.ToList(),
        };

        var processName = F("ProcessName", "Text", "进程名称", "可选。多个用分号隔开；支持 regex:正则。");
        var windowFields = new[]
        {
            processName,
            F("WindowTitle", "Text", "窗口标题", "可选。支持 regex:正则。"),
            F("WindowClass", "Text", "窗口类名", "可选。支持 regex:正则。"),
            F("ProcChangeCondition", "Enum", "进程切换条件"),
        };

        return new List<QuickerRpcTriggerEventTypeInfo>
        {
            E("WindowActivated", "窗口获得焦点", windowFields),
            E("WindowDeactivated", "窗口失去焦点", windowFields),
            E("ProcessStarted", "进程启动", processName),
            E("ProcessExited", "进程退出", processName),
            E("NetworkConnected", "网络已连接",
                F("MinConnectivityLevel", "Number", "最低连接级别"),
                F("NetworkName", "Text", "网络名称")),
            E("NetworkDisconnected", "网络已断开",
                F("NetworkName", "Text", "网络名称")),
            E("BluetoothDeviceConnected", "蓝牙设备已连接", F("DeviceName", "Text", "设备名称")),
            E("BluetoothDeviceDisconnected", "蓝牙设备已断开", F("DeviceName", "Text", "设备名称")),
            E("BluetoothDeviceInRange", "蓝牙LE设备进入范围", F("DeviceName", "Text", "设备名称")),
            E("BluetoothDeviceOutOfRange", "蓝牙LE设备离开范围", F("DeviceName", "Text", "设备名称")),
            E("DriveInserted", "驱动器插入",
                F("DriveLetter", "Text", "盘符"),
                F("DriveVolumeLabel", "Text", "卷标")),
            E("AudioDefaultDeviceChanged", "默认音频设备改变", F("DeviceName", "Text", "设备名称")),
            E("AudioDeviceActive", "音频设备激活", F("DeviceName", "Text", "设备名称")),
            E("AudioDeviceUnplugged", "音频设备拔出", F("DeviceName", "Text", "设备名称")),
            E("KeyToggled", "键盘开关键切换（如大小写锁定）", F("Key", "Number", "按键", "虚拟键码。")),
            E("BrowserUrlChanged", "浏览器标签页网址变化",
                F("UrlPattern", "Text", "网址匹配", "正则表达式。"),
                F("OnlyActiveTab", "Boolean", "仅活动标签页")),
            E("FileSystemChange", "文件系统变化",
                F("Path", "Text", "监控目录"),
                F("Filter", "Text", "文件过滤", "默认 *.*"),
                F("IncludeSubdirectories", "Boolean", "包含子目录"),
                F("WatchCreated", "Boolean", "监控创建"),
                F("WatchDeleted", "Boolean", "监控删除"),
                F("WatchChanged", "Boolean", "监控修改"),
                F("WatchRenamed", "Boolean", "监控重命名"),
                F("WatchError", "Boolean", "监控错误")),
            E("ClipboardChanged", "剪贴板内容改变",
                processName,
                F("ContentType", "Enum", "内容类型", "ALL|TEXT|HTML|IMAGE|FILE|CUSTOM"),
                F("CustomTypes", "Text", "自定义类型", "ContentType 为 CUSTOM 时生效。"),
                F("TextPattern", "Text", "文本匹配正则", "ContentType 为 TEXT 时生效。"),
                F("IgnoreQuickerGetSelected", "Boolean", "忽略Quicker获取选中内容"),
                F("IgnoreQuickerPaste", "Boolean", "忽略Quicker粘贴")),
            E("DisplaySettingsChanged", "显示设置改变"),
            E("PowerModeChanged", "电源模式改变"),
            E("SessionEnding", "会话即将结束（注销/关机）"),
            E("SessionSwitch", "会话切换"),
            E("SessionLock", "系统锁定"),
            E("SessionUnlock", "系统解锁"),
            E("UserPreferenceChanged", "用户首选项改变"),
            E("Repeat", "定时重复触发",
                F("RepeatInternval", "Number", "重复间隔（秒）", "注意：键名为 Quicker 原始拼写 RepeatInternval。"),
                F("MaxRepeatCount", "Number", "最大重复次数", "0 = 不限制。")),
            E("IdleTimeExpire", "空闲时间达到",
                F("ExpireSeconds", "Number", "空闲秒数", "默认 600。"),
                F("InputMethod", "Enum", "输入检测方式", "ANY|键盘|鼠标等。"),
                F("RepeatInternval", "Number", "空闲期间重复间隔（秒）"),
                F("MaxRepeatCount", "Number", "最大重复次数")),
            E("IdleEnd", "空闲结束（恢复活动）",
                F("InputMethod", "Enum", "输入检测方式")),
            E("BusyTimeExpire", "连续使用时间达到",
                F("RepeatInternval", "Number", "重复间隔（秒）"),
                F("IdelResetSeconds", "Number", "空闲多少秒后重置", "注意：键名为 Quicker 原始拼写 IdelResetSeconds。"),
                F("MaxRepeatCount", "Number", "最大重复次数"),
                F("InputMethod", "Enum", "输入检测方式")),
        };
    }
}
