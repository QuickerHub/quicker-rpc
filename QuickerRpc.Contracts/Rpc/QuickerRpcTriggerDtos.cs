using System;
using System.Collections.Generic;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>
/// One event trigger task (mirrors Quicker <c>UserSettings.TriggerTasks</c> / <c>CommonTriggerTask</c>).
/// As save input, null scalar fields mean "keep existing value" (update) or "use default" (create).
/// </summary>
public sealed class QuickerRpcTriggerTaskInfo
{
    /// <summary>Task id (Guid). Empty on create.</summary>
    public string Id { get; set; } = string.Empty;

    public string? Note { get; set; }

    public bool? IsEnabled { get; set; }

    /// <summary>Event type id, case sensitive (e.g. WindowActivated, ProcessStarted, FileSystemChange).</summary>
    public string? EventType { get; set; }

    /// <summary>Resolved event description (list output only).</summary>
    public string? EventDescription { get; set; }

    /// <summary>JSON object with event params (keys from trigger events catalog, e.g. {"ProcessName":"notepad"}).</summary>
    public string? ParamsJson { get; set; }

    /// <summary>Action id (Guid) or action title to run when triggered.</summary>
    public string? ActionIdOrName { get; set; }

    /// <summary>Resolved action title when ActionIdOrName is a known action id (list output only).</summary>
    public string? ActionTitle { get; set; }

    /// <summary>Optional parameter passed to the action.</summary>
    public string? ActionParam { get; set; }

    public int? DebounceMs { get; set; }

    public int? ThrottleMs { get; set; }

    /// <summary>Delay before running the action, milliseconds.</summary>
    public int? DelayMs { get; set; }

    /// <summary>Skip remaining trigger tasks for the same event occurrence.</summary>
    public bool? SkipFurtherTasks { get; set; }

    /// <summary>Optional event filter expression evaluated against event variables.</summary>
    public string? EventFilterExpression { get; set; }

    /// <summary>Machine binding (empty = all machines).</summary>
    public string? ValidForMachines { get; set; }

    public DateTime? LastEditTimeUtc { get; set; }
}

public sealed class QuickerRpcTriggerListResult
{
    public bool Ok { get; set; }

    public string? Message { get; set; }

    public int TotalCount { get; set; }

    public IList<QuickerRpcTriggerTaskInfo> Items { get; set; } = new List<QuickerRpcTriggerTaskInfo>();
}

/// <summary>Form field accepted in trigger task Params for one event type.</summary>
public sealed class QuickerRpcTriggerEventFieldInfo
{
    /// <summary>Params dictionary key.</summary>
    public string Key { get; set; } = string.Empty;

    public string? Label { get; set; }

    public string? HelpText { get; set; }

    /// <summary>Value type hint (Text, Boolean, Number, Enum, ...).</summary>
    public string? Type { get; set; }

    /// <summary>UI input hint (TextBox, CheckBox, DropDown, ...).</summary>
    public string? InputMethod { get; set; }

    /// <summary>For enum-like fields: newline-separated "label|value" options.</summary>
    public string? SelectionItems { get; set; }

    public bool IsRequired { get; set; }

    /// <summary>JSON-encoded default value, if any.</summary>
    public string? DefaultValueJson { get; set; }
}

/// <summary>Variable provided to the triggered action by an event type.</summary>
public sealed class QuickerRpcTriggerEventVariableInfo
{
    public string Key { get; set; } = string.Empty;

    public string? Type { get; set; }

    public string? Description { get; set; }
}

public sealed class QuickerRpcTriggerEventTypeInfo
{
    public string EventType { get; set; } = string.Empty;

    public string? Description { get; set; }

    public IList<QuickerRpcTriggerEventFieldInfo> Fields { get; set; } = new List<QuickerRpcTriggerEventFieldInfo>();

    public IList<QuickerRpcTriggerEventVariableInfo> Variables { get; set; } = new List<QuickerRpcTriggerEventVariableInfo>();
}

public sealed class QuickerRpcTriggerEventTypesResult
{
    public bool Ok { get; set; }

    public string? Message { get; set; }

    /// <summary>runtime (live Quicker trigger services) or static (embedded fallback catalog).</summary>
    public string Source { get; set; } = string.Empty;

    public IList<QuickerRpcTriggerEventTypeInfo> Items { get; set; } = new List<QuickerRpcTriggerEventTypeInfo>();
}

public sealed class QuickerRpcTriggerSaveResult
{
    public bool Ok { get; set; }

    public string? Message { get; set; }

    /// <summary>True when a new task was created (vs updated).</summary>
    public bool Created { get; set; }

    public QuickerRpcTriggerTaskInfo? Task { get; set; }

    public IList<string> Warnings { get; set; } = new List<string>();
}

public sealed class QuickerRpcTriggerDeleteResult
{
    public bool Ok { get; set; }

    public string? Message { get; set; }

    public string Id { get; set; } = string.Empty;
}
