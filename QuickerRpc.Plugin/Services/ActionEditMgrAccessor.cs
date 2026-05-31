using System;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Quicker.Domain;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Shared reflection access to Quicker's internal ActionEditMgr.
/// </summary>
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

    public object? CreateDefaultEditActionParam()
    {
        return EditActionParamType is null ? null : Activator.CreateInstance(EditActionParamType);
    }

    public static ActionEditMgrAccessor? TryCreate()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        try
        {
            var mgrType = typeof(AppState).Assembly.GetType("Quicker.Domain.Services.ActionEditMgr", throwOnError: false);
            if (mgrType is null)
            {
                return null;
            }

            var mgr = typeof(AppState).GetMethods(BindingFlags.NonPublic | BindingFlags.Static)
                .FirstOrDefault(x => x.ReturnType == mgrType)
                ?.Invoke(null, null);
            if (mgr is null)
            {
                return null;
            }

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
