using System;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows;
using Quicker.Common;
using Quicker.Domain;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>Cached access to Quicker <c>ActionEditMgr</c> (internal type — resolved once at startup).</summary>
internal sealed class ActionEditMgrAccessor
{
    private ActionEditMgrAccessor(
        object instance,
        MethodInfo? createOrEditGlobalSubProgram,
        MethodInfo? editActionById,
        MethodInfo? updateSharedActionAsync,
        MethodInfo? deleteAction,
        MethodInfo? saveEditingAction,
        MethodInfo? setButtonAction,
        MethodInfo? floatAction,
        Type? editActionParamType)
    {
        Instance = instance;
        CreateOrEditGlobalSubProgram = createOrEditGlobalSubProgram;
        EditActionById = editActionById;
        UpdateSharedActionAsync = updateSharedActionAsync;
        DeleteAction = deleteAction;
        SaveEditingAction = saveEditingAction;
        SetButtonAction = setButtonAction;
        FloatAction = floatAction;
        EditActionParamType = editActionParamType;
    }

    public object Instance { get; }

    public MethodInfo? CreateOrEditGlobalSubProgram { get; }

    public MethodInfo? EditActionById { get; }

    public MethodInfo? UpdateSharedActionAsync { get; }

    public MethodInfo? DeleteAction { get; }

    public MethodInfo? SaveEditingAction { get; }

    public MethodInfo? SetButtonAction { get; }

    public MethodInfo? FloatAction { get; }

    public Type? EditActionParamType { get; }

    public bool CanOpenDesigner =>
        CreateOrEditGlobalSubProgram is not null || EditActionById is not null;

    public object? CreateDefaultEditActionParam() =>
        EditActionParamType is null ? null : Activator.CreateInstance(EditActionParamType);

    public bool TrySetButtonAction(
        ActionProfile profile,
        int row,
        int col,
        ActionItem action,
        bool skipSave,
        out string? error)
    {
        error = null;
        if (SetButtonAction is null)
        {
            error = "SetButtonAction unavailable on ActionEditMgr.";
            return false;
        }

        try
        {
            SetButtonAction.Invoke(Instance, new object[] { profile, row, col, action, skipSave });
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

    public bool TryFloatAction(ActionItem action, Window ownerWindow, out string? error)
    {
        error = null;
        if (FloatAction is null)
        {
            error = "FloatAction unavailable on ActionEditMgr.";
            return false;
        }

        if (ownerWindow is null)
        {
            error = "No WPF owner window available for FloatAction.";
            return false;
        }

        try
        {
            FloatAction.Invoke(Instance, new object[] { action, ownerWindow });
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

    public bool TrySaveEditingAction(object resultAction, out string? error)
    {
        error = null;
        if (SaveEditingAction is null)
        {
            error = "SaveEditingAction unavailable on ActionEditMgr.";
            return false;
        }

        try
        {
            SaveEditingAction.Invoke(Instance, new[] { resultAction });
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

    public static ActionEditMgrAccessor? TryCreate()
    {
        if (!QuickerInternalAccess.IsInQuicker)
        {
            return null;
        }

        try
        {
            var mgr = QuickerInternalAccess.TryGetActionEditMgr();
            if (mgr is null)
            {
                return null;
            }

            var mgrType = mgr.GetType();
            var instanceMethods = mgrType.GetMethods(BindingFlags.Public | BindingFlags.Instance);

            var createOrEditGlobalSubProgram = instanceMethods.FirstOrDefault(m =>
                string.Equals(m.Name, "CreateOrEditGlobalSubProgram", StringComparison.Ordinal)
                && m.GetParameters().Length == 1);

            var editActionById = instanceMethods.FirstOrDefault(m =>
                string.Equals(m.Name, "EditActionById", StringComparison.Ordinal)
                && m.GetParameters().Length == 3
                && m.GetParameters()[0].ParameterType == typeof(string));

            var updateSharedActionAsync = instanceMethods.FirstOrDefault(m =>
                string.Equals(m.Name, "UpdateSharedActionAsync", StringComparison.Ordinal)
                && m.ReturnType.IsGenericType
                && m.GetParameters().Length == 2
                && m.GetParameters()[0].ParameterType == typeof(string)
                && m.GetParameters()[1].ParameterType == typeof(string));

            var deleteAction = instanceMethods.FirstOrDefault(m =>
                string.Equals(m.Name, "DeleteAction", StringComparison.Ordinal)
                && m.GetParameters().Length == 4
                && m.ReturnType.IsGenericType
                && m.ReturnType.GetGenericTypeDefinition() == typeof(Task<>)
                && m.ReturnType.GetGenericArguments()[0] == typeof(bool));

            var saveEditingAction = instanceMethods.FirstOrDefault(m =>
                string.Equals(m.Name, "SaveEditingAction", StringComparison.Ordinal)
                && m.GetParameters().Length == 1);

            var setButtonAction = instanceMethods.FirstOrDefault(m =>
                string.Equals(m.Name, "SetButtonAction", StringComparison.Ordinal)
                && m.GetParameters().Length == 5
                && m.GetParameters()[0].ParameterType == typeof(ActionProfile)
                && m.GetParameters()[3].ParameterType == typeof(ActionItem));

            var floatAction = instanceMethods.FirstOrDefault(m =>
                string.Equals(m.Name, "FloatAction", StringComparison.Ordinal)
                && m.GetParameters().Length == 2
                && m.GetParameters()[0].ParameterType == typeof(ActionItem)
                && typeof(Window).IsAssignableFrom(m.GetParameters()[1].ParameterType));

            var editActionParamType = typeof(AppState).Assembly.GetType(
                "Quicker.Domain.Services.EditActionParam",
                throwOnError: false);

            return new ActionEditMgrAccessor(
                mgr,
                createOrEditGlobalSubProgram,
                editActionById,
                updateSharedActionAsync,
                deleteAction,
                saveEditingAction,
                setButtonAction,
                floatAction,
                editActionParamType);
        }
        catch
        {
            return null;
        }
    }
}
