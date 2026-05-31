using System;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
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
        Type? editActionParamType)
    {
        Instance = instance;
        CreateOrEditGlobalSubProgram = createOrEditGlobalSubProgram;
        EditActionById = editActionById;
        UpdateSharedActionAsync = updateSharedActionAsync;
        DeleteAction = deleteAction;
        SaveEditingAction = saveEditingAction;
        EditActionParamType = editActionParamType;
    }

    public object Instance { get; }

    public MethodInfo? CreateOrEditGlobalSubProgram { get; }

    public MethodInfo? EditActionById { get; }

    public MethodInfo? UpdateSharedActionAsync { get; }

    public MethodInfo? DeleteAction { get; }

    public MethodInfo? SaveEditingAction { get; }

    public Type? EditActionParamType { get; }

    public bool CanOpenDesigner =>
        CreateOrEditGlobalSubProgram is not null || EditActionById is not null;

    public object? CreateDefaultEditActionParam() =>
        EditActionParamType is null ? null : Activator.CreateInstance(EditActionParamType);

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
                editActionParamType);
        }
        catch
        {
            return null;
        }
    }
}
