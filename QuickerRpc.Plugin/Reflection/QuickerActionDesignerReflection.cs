using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Reflection;

/// <summary>
/// <c>ActionDesignerWindow</c> reflection for paste/refresh.
/// Release: locate <c>UpdateXActionUi</c> via CeaQuicker anchor
/// (<c>CheckIfCanSave</c> + offset 6 in <c>GetMethods</c> name order); see
/// <c>CeaQuickerTools/Quicker/ActionEditor.cs</c>.
/// </summary>
internal static class QuickerActionDesignerReflection
{
    internal const string DesignerWindowTypeFullName = "Quicker.View.X.ActionDesignerWindow";
    internal const string ActionStepsWrapperTypeFullName = "Quicker.View.X.ActionStepsWrapper";
    internal const string VariableListControlTypeFullName = "Quicker.View.X.Controls.VariableListControl";
    internal const string ActionStepsDtoTypeFullName = "Quicker.Domain.ActionStepsDto";

    /// <summary>CeaQuicker <c>ActionEditor.GetMethodName</c> anchor (stable on Release).</summary>
    internal const string UpdateUiAnchorMethodName = "CheckIfCanSave";

    internal const int UpdateXActionUiAnchorOffset = 6;

    /// <summary>Fallback: declared-only void() sorted by metadata token.</summary>
    internal const int UpdateXActionUiVoidMethodIndex = 10;

    internal const int DoSaveActionStateVoidMethodIndex = 4;

    internal const int ClearNotUsedInternalSubProgramsAnchorIndex = 14;

    internal const string ClearNotUsedInternalSubProgramsAnchorName = "ClearNotUsedInternalSubPrograms";

    internal static readonly BindingFlags DeclaredInstanceAll =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly;

    internal static readonly BindingFlags InstanceAll =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    public static Type? TryGetDesignerWindowType(Assembly assembly) =>
        QuickerAssemblyReflection.TryGetTypeByFullName(assembly, DesignerWindowTypeFullName);

    /// <summary>Declared-only instance void() methods on <c>ActionDesignerWindow</c>, sorted by metadata token.</summary>
    public static IReadOnlyList<MethodInfo> GetDeclaredVoidNoArgInstanceMethods(Type designerWindowType) =>
        designerWindowType
            .GetMethods(DeclaredInstanceAll)
            .Where(m =>
                !m.IsStatic
                && m.ReturnType == typeof(void)
                && m.GetParameters().Length == 0)
            .OrderBy(m => m.MetadataToken)
            .ToList();

    public static MethodInfo? TryFindUpdateXActionUiMethod(Type designerWindowType)
    {
        var byName = designerWindowType.GetMethod("UpdateXActionUi", DeclaredInstanceAll)
            ?? designerWindowType.GetMethod("UpdateXActionUi", InstanceAll);
        if (byName is not null)
        {
            return byName;
        }

        var byAnchor = TryFindMethodByNameListAnchorOffset(
            designerWindowType,
            UpdateUiAnchorMethodName,
            UpdateXActionUiAnchorOffset);
        if (byAnchor is not null)
        {
            return byAnchor;
        }

        return TryGetVoidNoArgMethodByIndex(
            designerWindowType,
            UpdateXActionUiVoidMethodIndex,
            validateAnchor: true);
    }

    /// <summary>
    /// Same algorithm as CeaQuicker <c>ActionEditor.GetMethodName</c>:
    /// flat <c>GetMethods(Instance|Public|NonPublic)</c> list, first anchor name match, +offset.
    /// </summary>
    public static MethodInfo? TryFindMethodByNameListAnchorOffset(
        Type designerWindowType,
        string anchorMethodName,
        int offset)
    {
        if (string.IsNullOrEmpty(anchorMethodName) || offset < 0)
        {
            return null;
        }

        var methods = designerWindowType.GetMethods(InstanceAll);
        var anchorIndex = -1;
        for (var i = 0; i < methods.Length; i++)
        {
            if (string.Equals(methods[i].Name, anchorMethodName, StringComparison.Ordinal))
            {
                anchorIndex = i;
                break;
            }
        }

        if (anchorIndex < 0)
        {
            return null;
        }

        var targetIndex = anchorIndex + offset;
        return targetIndex < methods.Length ? methods[targetIndex] : null;
    }

    /// <summary>
    /// Native import flow: <c>ReplaceActionContent</c> on the open designer's <see cref="XAction"/>
    /// (same object identity — do not replace the whole <c>Action</c> attached property), then refresh UI.
    /// </summary>
    public static bool TryImportActionDefinition(object designerWindow, XAction imported, out string? error)
    {
        error = null;
        if (designerWindow is null || imported is null)
        {
            error = "Designer or action is null.";
            return false;
        }

        var designerType = designerWindow.GetType();
        if (designerType.GetProperty("Action", InstanceAll)?.GetValue(designerWindow) is not XAction current)
        {
            error = "Designer Action is not available.";
            return false;
        }

        XAction payload;
        try
        {
            payload = JsonConvert.DeserializeObject<XAction>(JsonConvert.SerializeObject(imported))
                ?? throw new InvalidOperationException("XAction clone returned null.");
        }
        catch (Exception ex)
        {
            error = "Failed to clone imported XAction: " + ex.Message;
            return false;
        }

        TryInvokeDoSaveActionState(designerWindow, designerType);
        ReplaceActionContentNative(current, payload);
        TryInvokeDoSaveActionState(designerWindow, designerType);

        if (!TryRefreshDesignerUiAfterReplace(designerWindow, current, out error))
        {
            return false;
        }

        return true;
    }

    /// <summary>Legacy name; delegates to <see cref="TryImportActionDefinition"/>.</summary>
    public static bool TrySetActionAndRefreshUi(object designerWindow, XAction action, out string? error) =>
        TryImportActionDefinition(designerWindow, action, out error);

    /// <summary>Same as <c>IActionDesignerHostContext.ReplaceActionContent</c>.</summary>
    internal static void ReplaceActionContentNative(XAction target, XAction source)
    {
        target.Steps = source.Steps ?? new List<global::Quicker.Domain.Actions.X.Storage.ActionStep>();
        target.Variables = source.Variables ?? new List<global::Quicker.Domain.Actions.X.Storage.ActionVariable>();
        target.SubPrograms = source.SubPrograms ?? new List<SubProgram>();
        if (source.SummaryExpression is not null)
        {
            target.SummaryExpression = source.SummaryExpression;
        }
    }

    internal static void CopyActionContentInPlace(XAction target, XAction source) =>
        ReplaceActionContentNative(target, source);

    private static bool TryRefreshDesignerUiAfterReplace(
        object designerWindow,
        XAction action,
        out string? error)
    {
        if (TryInvokeUpdateXActionUi(designerWindow, out error))
        {
            return true;
        }

        if (TryInvokeActionEditorReloadSteps(designerWindow, action, out _))
        {
            error = null;
            return true;
        }

        return TryRefreshUiFromAction(designerWindow, action, out error);
    }

    private static void TryInvokeDoSaveActionState(object designerWindow, Type designerType)
    {
        var save = TryFindDoSaveActionStateMethod(designerType);
        if (save is null)
        {
            return;
        }

        try
        {
            save.Invoke(designerWindow, null);
        }
        catch
        {
            // Undo snapshot is best-effort for paste preview.
        }
    }

    public static bool TryInvokeActionEditorReloadSteps(object designerWindow, XAction action, out string? error)
    {
        error = null;
        if (!TryGetActionEditorControl(designerWindow, out var editor) || editor is null)
        {
            error = "ActionEditor not found.";
            return false;
        }

        var reload = editor.GetType().GetMethod("ReloadStepsAndVariableBindings", InstanceAll);
        if (reload is null)
        {
            error = "ReloadStepsAndVariableBindings not found.";
            return false;
        }

        try
        {
            reload.Invoke(editor, new object[] { action });
            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryGetActionEditorControl(object designerWindow, out object? editor)
    {
        editor = null;
        if (designerWindow is null)
        {
            return false;
        }

        var designerType = designerWindow.GetType();
        var field = designerType.GetField("ActionEditor", InstanceAll);
        if (field?.GetValue(designerWindow) is { } fromField)
        {
            editor = fromField;
            return true;
        }

        if (designerWindow is System.Windows.FrameworkElement fe
            && fe.FindName("ActionEditor") is { } fromName)
        {
            editor = fromName;
            return true;
        }

        return false;
    }

    public static MethodInfo? TryFindDoSaveActionStateMethod(Type designerWindowType)
    {
        var byName = designerWindowType.GetMethod("DoSaveActionState", DeclaredInstanceAll);
        if (byName is not null)
        {
            return byName;
        }

        return TryGetVoidNoArgMethodByIndex(
            designerWindowType,
            DoSaveActionStateVoidMethodIndex,
            validateAnchor: true);
    }

    private static string? _ceaUpdateUiMethodName;

    /// <summary>
    /// Resolve once like <c>ActionEditor.MethodName</c> (flat <c>GetMethods</c> name at CheckIfCanSave+6).
    /// </summary>
    public static string? GetCeaUpdateUiMethodName()
    {
        if (!string.IsNullOrEmpty(_ceaUpdateUiMethodName))
        {
            return _ceaUpdateUiMethodName;
        }

        var designerType = ResolveDesignerWindowTypeForCeaAnchor();
        if (designerType is null)
        {
            return null;
        }

        var names = designerType.GetMethods(InstanceAll).Select(m => m.Name).ToList();
        var anchorIndex = names.IndexOf(UpdateUiAnchorMethodName);
        if (anchorIndex < 0)
        {
            return null;
        }

        var targetIndex = anchorIndex + UpdateXActionUiAnchorOffset;
        if (targetIndex >= names.Count)
        {
            return null;
        }

        _ceaUpdateUiMethodName = names[targetIndex];
        return _ceaUpdateUiMethodName;
    }

    /// <summary>
    /// Same as CeaQuicker <c>ActionEditor.Update</c> → <c>CallMethod(MethodName)</c> on runtime type.
    /// </summary>
    public static bool TryInvokeUpdateXActionUiCeaStyle(object designerWindow, out string? error)
    {
        error = null;
        if (designerWindow is null)
        {
            error = "Designer window is null.";
            return false;
        }

        var methodName = GetCeaUpdateUiMethodName();
        if (string.IsNullOrEmpty(methodName))
        {
            var fallback = TryFindUpdateXActionUiMethod(designerWindow.GetType());
            if (fallback is null)
            {
                error = "UpdateXActionUi not resolved.";
                return false;
            }

            try
            {
                fallback.Invoke(designerWindow, null);
                return true;
            }
            catch (TargetInvocationException ex)
            {
                error = ex.InnerException?.Message ?? ex.Message;
                return false;
            }
        }

        try
        {
            var method = designerWindow.GetType().GetMethod(methodName, InstanceAll);
            if (method is null)
            {
                error = "Update UI method not found: " + methodName;
                return false;
            }

            method.Invoke(designerWindow, null);
            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static Type? ResolveDesignerWindowTypeForCeaAnchor()
    {
        if (QuickerAssemblyReflection.TryResolveQuickerEntryAssembly(out var entry))
        {
            var fromEntry = TryGetDesignerWindowType(entry);
            if (fromEntry is not null)
            {
                return fromEntry;
            }
        }

        return DesignerWindowTypeFromLoadedAssemblies();
    }

    private static Type? DesignerWindowTypeFromLoadedAssemblies()
    {
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (!string.Equals(assembly.GetName().Name, QuickerAssemblyReflection.QuickerEntryAssemblyName, StringComparison.Ordinal))
            {
                continue;
            }

            var t = TryGetDesignerWindowType(assembly);
            if (t is not null)
            {
                return t;
            }
        }

        return null;
    }

    public static bool TryInvokeUpdateXActionUi(object designerWindow, out string? error) =>
        TryInvokeUpdateXActionUiCeaStyle(designerWindow, out error);

    /// <summary>Verify paste-refresh surface (Release probe).</summary>
    public static bool TryVerifyPasteRefreshSurface(Assembly assembly, out string? missing)
    {
        missing = null;
        var designerType = TryGetDesignerWindowType(assembly);
        if (designerType is null)
        {
            missing = DesignerWindowTypeFullName;
            return false;
        }

        if (designerType.GetProperty("VariableList", InstanceAll) is null)
        {
            missing = "ActionDesignerWindow.VariableList";
            return false;
        }

        if (designerType.GetProperty("SubPrograms", InstanceAll) is null)
        {
            missing = "ActionDesignerWindow.SubPrograms";
            return false;
        }

        if (designerType.GetField("ActionStepsWrapper", InstanceAll) is null)
        {
            missing = "ActionDesignerWindow.ActionStepsWrapper";
            return false;
        }

        if (designerType.GetField("VariableListControl", InstanceAll) is null)
        {
            missing = "ActionDesignerWindow.VariableListControl";
            return false;
        }

        var wrapperType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, ActionStepsWrapperTypeFullName);
        if (wrapperType?.GetMethod("SetSteps", InstanceAll) is null)
        {
            missing = "ActionStepsWrapper.SetSteps";
            return false;
        }

        var variableListType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, VariableListControlTypeFullName);
        if (variableListType?.GetMethod("SetDataSource", InstanceAll) is null)
        {
            missing = "VariableListControl.SetDataSource";
            return false;
        }

        if (TryFindUpdateXActionUiMethod(designerType) is null)
        {
            missing = "UpdateXActionUi (name, CheckIfCanSave+6, or void()-index "
                + UpdateXActionUiVoidMethodIndex + ")";
            return false;
        }

        return true;
    }

    /// <summary>
    /// Fallback: refresh UI via stable fields when <see cref="TryInvokeUpdateXActionUi"/> is unavailable.
    /// </summary>
    public static bool TryRefreshUiFromAction(object designerWindow, XAction action, out string? error)
    {
        error = null;
        if (designerWindow is null || action is null)
        {
            error = "Designer or action is null.";
            return false;
        }

        var designerType = designerWindow.GetType();
        if (!string.Equals(designerType.FullName, DesignerWindowTypeFullName, StringComparison.Ordinal))
        {
            error = "Not an ActionDesignerWindow.";
            return false;
        }

        try
        {
            if (!TryResetCollectionProperty(designerType, designerWindow, "VariableList", action.Variables, out error))
            {
                return false;
            }

            if (action.SubPrograms is { Count: > 0 })
            {
                if (!TryResetCollectionProperty(designerType, designerWindow, "SubPrograms", action.SubPrograms, out error))
                {
                    return false;
                }
            }
            else if (!TryClearCollectionProperty(designerType, designerWindow, "SubPrograms", out error))
            {
                return false;
            }

            if (!TryGetFieldValue(designerType, designerWindow, "ActionStepsWrapper", out var wrapperObj)
                || wrapperObj is null)
            {
                error = "ActionStepsWrapper field not found.";
                return false;
            }

            var setSteps = wrapperObj.GetType().GetMethod("SetSteps", InstanceAll);
            if (setSteps is null)
            {
                error = "ActionStepsWrapper.SetSteps not found.";
                return false;
            }

            var steps = (IList)(action.Steps ?? new List<global::Quicker.Domain.Actions.X.Storage.ActionStep>());
            setSteps.Invoke(wrapperObj, new object[] { steps });

            if (TryGetFieldValue(designerType, designerWindow, "VariableListControl", out var variableListControl)
                && variableListControl is not null
                && designerType.GetProperty("VariableList", InstanceAll)?.GetValue(designerWindow) is { } variableList)
            {
                var setDataSource = variableListControl.GetType().GetMethod("SetDataSource", InstanceAll);
                setDataSource?.Invoke(variableListControl, new object[] { variableList, action });
            }

            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    /// <summary>Release: single void(ActionStepsDto) on designer — obfuscated name, stable signature.</summary>
    public static MethodInfo? TryFindRestoreStateMethod(Type designerWindowType, Assembly assembly)
    {
        var dtoType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, ActionStepsDtoTypeFullName);
        if (dtoType is null)
        {
            return null;
        }

        var matches = designerWindowType
            .GetMethods(InstanceAll)
            .Where(m =>
                !m.IsStatic
                && m.ReturnType == typeof(void)
                && m.GetParameters().Length == 1
                && m.GetParameters()[0].ParameterType == dtoType)
            .ToList();

        return matches.Count == 1 ? matches[0] : null;
    }

    private static MethodInfo? TryGetVoidNoArgMethodByIndex(
        Type designerWindowType,
        int index,
        bool validateAnchor)
    {
        var methods = GetDeclaredVoidNoArgInstanceMethods(designerWindowType);
        if (methods.Count <= index)
        {
            return null;
        }

        if (validateAnchor
            && methods.Count > ClearNotUsedInternalSubProgramsAnchorIndex
            && !string.Equals(
                methods[ClearNotUsedInternalSubProgramsAnchorIndex].Name,
                ClearNotUsedInternalSubProgramsAnchorName,
                StringComparison.Ordinal))
        {
            return null;
        }

        return methods[index];
    }

    private static bool TryResetCollectionProperty(
        Type designerType,
        object designer,
        string propertyName,
        IEnumerable? items,
        out string? error)
    {
        error = null;
        var property = designerType.GetProperty(propertyName, InstanceAll);
        if (property?.GetValue(designer) is not object collection)
        {
            error = propertyName + " collection not found.";
            return false;
        }

        var reset = collection.GetType().GetMethod("Reset", InstanceAll);
        if (reset is null)
        {
            error = collection.GetType().Name + ".Reset not found.";
            return false;
        }

        reset.Invoke(collection, new object?[] { items });
        return true;
    }

    private static bool TryClearCollectionProperty(
        Type designerType,
        object designer,
        string propertyName,
        out string? error)
    {
        error = null;
        var property = designerType.GetProperty(propertyName, InstanceAll);
        if (property?.GetValue(designer) is not object collection)
        {
            error = propertyName + " collection not found.";
            return false;
        }

        var clear = collection.GetType().GetMethod("Clear", InstanceAll);
        if (clear is null)
        {
            error = collection.GetType().Name + ".Clear not found.";
            return false;
        }

        clear.Invoke(collection, null);
        return true;
    }

    private static bool TryGetFieldValue(
        Type designerType,
        object designer,
        string fieldName,
        out object? value)
    {
        value = null;
        var field = designerType.GetField(fieldName, InstanceAll);
        if (field is null)
        {
            return false;
        }

        value = field.GetValue(designer);
        return true;
    }
}
