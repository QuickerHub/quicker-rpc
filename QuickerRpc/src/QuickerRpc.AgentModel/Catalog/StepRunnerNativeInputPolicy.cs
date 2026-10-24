using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Strict native facts retained alongside the legacy normalized catalog; no inferred defaults.</summary>
public sealed class StepRunnerNativeInputPolicy
{
    public int? VarType { get; private set; }
    public int? VariableMode { get; private set; }
    public bool? AllowInput { get; private set; }
    public bool? IsControlField { get; private set; }
    public int? InputSources { get; private set; }
    public int? EditorHint { get; private set; }
    public bool OptionalPolicyKnown { get; private set; }
    public bool VisibilityKnown { get; private set; }
    public bool SelectionKnown { get; private set; }
    public bool HasValidFor { get; private set; }
    public bool HasInvalidFor { get; private set; }
    public string? DefaultControlValue { get; private set; }
    public string? VisibleExpression { get; private set; }
    public IList<string> ValidFor { get; private set; } = new List<string>();
    public IList<string> InvalidFor { get; private set; } = new List<string>();
    public IList<string> Options { get; private set; } = new List<string>();
    public bool PolicyKnown => VarType.HasValue && VariableMode is >= 0 and <= 3
        && AllowInput.HasValue && IsControlField.HasValue && OptionalPolicyKnown && SelectionKnown;

    public static string? CaptureRunnerVisibilityUnknownReason(object runner)
    {
        try
        {
            var type = runner.GetType();
            foreach (var contract in type.GetInterfaces())
                if (contract.Name == "IMultiOperationStep") return "NATIVE_OPERATION_MEMBERSHIP_REQUIRES_CONTEXT";
            for (var current = type; current is not null; current = current.BaseType)
                if (current.Name == "BaseMultiOperationStep") return "NATIVE_OPERATION_MEMBERSHIP_REQUIRES_CONTEXT";
            return null;
        }
        catch { return "NATIVE_RUNNER_VISIBILITY_UNKNOWN"; }
    }

    public static StepRunnerNativeInputPolicy Capture(object definition)
    {
        try { return CaptureCore(definition); }
        catch { return new StepRunnerNativeInputPolicy(); }
    }

    private static StepRunnerNativeInputPolicy CaptureCore(object definition)
    {
        var facts = new StepRunnerNativeInputPolicy
        {
            VarType = ReadEnum(definition, "Type"),
            VariableMode = ReadEnum(definition, "VariableMode"),
            AllowInput = ReadBool(definition, "AllowInput"),
            IsControlField = ReadBool(definition, "IsControlField"),
        };
        var sourcesKnown = OptionalEnum(definition, "InputSources", out var sources);
        var hintKnown = OptionalEnum(definition, "EditorHint", out var hint);
        facts.InputSources = sources;
        facts.EditorHint = hint;
        facts.OptionalPolicyKnown = sourcesKnown && hintKnown && (sources is null or >= 0 and <= 63) && (hint is null or >= 0 and <= 2);
        facts.SelectionKnown = ReadOptions(definition, out var options);
        facts.Options = options;
        if (TryRead(definition, "DefaultValue", out var defaultValue))
            facts.DefaultControlValue = NativeDefaultLiteral(defaultValue);
        var validKnown = ReadStrings(definition, "ValidForList", out var valid, out var hasValid);
        var invalidKnown = ReadStrings(definition, "InvalidForList", out var invalid, out var hasInvalid);
        var expressionKnown = TryRead(definition, "VisibleExpression", out var expression) && expression is null or string;
        var structuredKnown = OptionalNull(definition, "VisibleWhen");
        facts.ValidFor = valid;
        facts.InvalidFor = invalid;
        facts.HasValidFor = hasValid;
        facts.HasInvalidFor = hasInvalid;
        facts.VisibleExpression = expression as string;
        facts.VisibilityKnown = validKnown && invalidKnown && expressionKnown && structuredKnown;
        return facts;
    }

    private static string? NativeDefaultLiteral(object? value)
    {
        // InputParamEditorControl.GetDefaultValueString uses invariant conversion and lowercase booleans.
        if (value is string text) return text;
        if (value is bool boolean) return boolean ? "true" : "false";
        if (value is Enum || value is byte or sbyte or short or ushort or int or uint or long or ulong or float or double or decimal or char)
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        return null;
    }

    private static bool TryRead(object target, string name, out object? value)
    {
        value = null;
        try
        {
            var property = target.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
            if (property is null || property.GetIndexParameters().Length != 0 || !property.CanRead) return false;
            value = property.GetValue(target);
            return true;
        }
        catch { return false; }
    }

    private static bool? ReadBool(object target, string name) =>
        TryRead(target, name, out var value) && value is bool boolean ? boolean : (bool?)null;

    private static int? ReadEnum(object target, string name)
    {
        if (!TryRead(target, name, out var value) || value is not Enum) return null;
        try { return Convert.ToInt32(value, CultureInfo.InvariantCulture); }
        catch { return null; }
    }

    private static bool OptionalEnum(object target, string name, out int? value)
    {
        value = null;
        try
        {
            if (target.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance) is null) return true;
            value = ReadEnum(target, name);
            return value.HasValue;
        }
        catch { return false; }
    }

    private static bool OptionalNull(object target, string name)
    {
        try
        {
            return target.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance) is null
                || (TryRead(target, name, out var value) && value is null);
        }
        catch { return false; }
    }

    private static bool ReadStrings(object target, string name, out IList<string> result, out bool present)
    {
        result = new List<string>();
        present = false;
        if (!TryRead(target, name, out var value)) return false;
        if (value is null) return true;
        present = true;
        if (value is string || value is not IEnumerable items) return false;
        foreach (var item in items)
        {
            if (item is not string text) return false;
            result.Add(text);
        }
        return true;
    }

    private static bool ReadOptions(object target, out IList<string> result)
    {
        result = new List<string>();
        if (!TryRead(target, "SelectionItems", out var value)) return false;
        if (value is null) return true;
        if (value is string || value is not IEnumerable items) return false;
        foreach (var item in items)
        {
            if (item is null || !TryRead(item, "Value", out var raw) || raw is not string text) return false;
            result.Add(text);
        }
        return true;
    }
}
