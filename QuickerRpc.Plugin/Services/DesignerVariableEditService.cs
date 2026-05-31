using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using Quicker.Domain;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Edits variable default values via ActionDesignerWindow for global subprograms and local actions.
/// </summary>
public sealed class DesignerVariableEditService
{
    private readonly ActionEditMgrAccessor? _actionEditMgr;
    private readonly Type? _designerWindowType;
    private readonly MethodInfo? _doActionOnLoadedMethod;
    private readonly MethodInfo? _triggerClickMethod;
    private readonly Type? _actionVariableType;

    public DesignerVariableEditService()
    {
        _actionEditMgr = ActionEditMgrAccessor.TryCreate();
        _designerWindowType = typeof(AppState).Assembly.GetType("Quicker.View.X.ActionDesignerWindow", throwOnError: false);
        _actionVariableType = typeof(AppState).Assembly.GetType("Quicker.Domain.Actions.X.Storage.ActionVariable", throwOnError: false)
            ?? typeof(AppState).Assembly.GetType("Quicker.Domain.Actions.ActionVariable", throwOnError: false)
            ?? typeof(AppState).Assembly.GetType("Quicker.Domain.Actions.X.ActionVariable", throwOnError: false);
        _doActionOnLoadedMethod =
            TryFindExtensionMethod("DoActionOnLoaded", typeof(Window), typeof(Action), typeof(int))
            ?? TryFindExtensionMethod("DoActionOnLoaded", typeof(Window), typeof(Action));
        _triggerClickMethod = TryFindExtensionMethod("TriggerClick", typeof(Button));
    }

    public async Task<QuickerRpcSubProgramVariableEditResult> EditVariableAsync(
        string targetIdOrName,
        string variableKey,
        string defaultValue)
    {
        var idOrName = (targetIdOrName ?? string.Empty).Trim();
        var key = (variableKey ?? string.Empty).Trim();
        var value = defaultValue ?? string.Empty;

        if (string.IsNullOrWhiteSpace(idOrName))
        {
            return Fail(null, null, null, null, "targetIdOrName is required.");
        }

        if (string.IsNullOrWhiteSpace(key))
        {
            return Fail(idOrName, null, null, null, "variableKey is required.");
        }

        var unavailable = DescribeUnavailableDependencies();
        if (unavailable is not null)
        {
            return Fail(idOrName, null, key, value, $"Action designer automation unavailable ({unavailable}).");
        }

        if (!TryOpenDesigner(idOrName, out var targetKind, out var openError))
        {
            return Fail(idOrName, null, key, value, openError ?? $"Target not found: {idOrName}");
        }

        var designer = await WaitForDesignerWindowAsync().ConfigureAwait(true);
        if (designer is null)
        {
            return Fail(idOrName, targetKind, key, value, "ActionDesignerWindow did not open in time.");
        }

        await Task.Delay(200).ConfigureAwait(true);

        string? oldValue = null;
        var saved = false;
        var notFound = false;

        try
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                _doActionOnLoadedMethod!.Invoke(
                    null,
                    BuildDoActionOnLoadedArgs(designer, () =>
                    {
                        var variable = FindVariable(designer, key);
                        if (variable is null)
                        {
                            notFound = true;
                            return;
                        }

                        oldValue = ReadDefaultValue(variable);
                        WriteDefaultValue(variable, value);
                        saved = true;

                        var saveButton = designer.FindName("BtnSave") as Button;
                        if (saveButton is not null)
                        {
                            _triggerClickMethod!.Invoke(null, new object[] { saveButton });
                        }
                    }));
            });
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            return Fail(idOrName, targetKind, key, value, ex.InnerException.Message);
        }
        catch (Exception ex)
        {
            return Fail(idOrName, targetKind, key, value, ex.Message);
        }

        if (notFound)
        {
            var targetLabel = DescribeTargetLabel(targetKind);
            return Fail(idOrName, targetKind, key, value, $"Variable '{key}' not found in {targetLabel} '{idOrName}'.");
        }

        if (!saved)
        {
            return Fail(idOrName, targetKind, key, value, "Failed to update variable default value.");
        }

        var message = string.IsNullOrWhiteSpace(oldValue)
            ? $"变量 {key} 已设为 {value}"
            : $"变量 {key} 变更 {oldValue} => {value}";

        return new QuickerRpcSubProgramVariableEditResult
        {
            Ok = true,
            TargetKind = targetKind,
            SubProgramIdOrName = idOrName,
            VariableKey = key,
            OldValue = oldValue,
            NewValue = value,
            Message = message,
        };
    }

    private bool TryOpenDesigner(string idOrName, out string targetKind, out string? errorMessage)
    {
        targetKind = QuickerRpcVariableTargetKinds.SubProgram;
        errorMessage = null;

        object? subProgram;
        try
        {
            subProgram = AppState.DataService.GetGlobalSubProgram(idOrName);
        }
        catch (Exception ex)
        {
            errorMessage = ex.Message;
            return false;
        }

        if (subProgram is not null)
        {
            if (_actionEditMgr!.CreateOrEditGlobalSubProgram is null)
            {
                errorMessage = "ActionEditMgr.CreateOrEditGlobalSubProgram is unavailable.";
                return false;
            }

            return TryInvokeOpenDesigner(
                () => _actionEditMgr.CreateOrEditGlobalSubProgram.Invoke(_actionEditMgr.Instance, new[] { subProgram }),
                "CreateOrEditGlobalSubProgram",
                out errorMessage);
        }

        if (!ActionContextResolver.TryResolve(idOrName, out _, out _, out var resolveError))
        {
            errorMessage =
                $"Target not found: {idOrName}. Expected a global subprogram name/id or a local action id." +
                (string.IsNullOrWhiteSpace(resolveError) ? string.Empty : $" ({resolveError})");
            return false;
        }

        if (_actionEditMgr!.EditActionById is null)
        {
            errorMessage = "ActionEditMgr.EditActionById is unavailable.";
            return false;
        }

        targetKind = QuickerRpcVariableTargetKinds.Action;
        return TryInvokeOpenDesigner(
            () => _actionEditMgr.EditActionById.Invoke(
                _actionEditMgr.Instance,
                new object?[] { idOrName, _actionEditMgr.CreateDefaultEditActionParam(), false }),
            "EditActionById",
            out errorMessage);
    }

    private bool TryInvokeOpenDesigner(Action openDesigner, string methodName, out string? errorMessage)
    {
        _ = methodName;
        errorMessage = null;
        try
        {
            openDesigner();
            return true;
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            errorMessage = ex.InnerException.Message;
            return false;
        }
        catch (Exception ex)
        {
            errorMessage = ex.Message;
            return false;
        }
    }

    private async Task<Window?> WaitForDesignerWindowAsync()
    {
        for (var i = 0; i < 30; i++)
        {
            var designer = GetForegroundWpfWindow();
            if (designer is not null && _designerWindowType!.IsInstanceOfType(designer))
            {
                return designer;
            }

            await Task.Delay(100).ConfigureAwait(true);
        }

        return null;
    }

    private string? DescribeUnavailableDependencies()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return "Not running inside Quicker.";
        }

        var missing = new List<string>();
        if (_actionEditMgr is null || !_actionEditMgr.CanOpenDesigner)
        {
            missing.Add("ActionEditMgr designer open methods");
        }

        if (_designerWindowType is null)
        {
            missing.Add("ActionDesignerWindow");
        }

        if (_actionVariableType is null)
        {
            missing.Add("ActionVariable");
        }

        if (_doActionOnLoadedMethod is null)
        {
            missing.Add("DoActionOnLoaded");
        }

        if (_triggerClickMethod is null)
        {
            missing.Add("TriggerClick");
        }

        return missing.Count == 0 ? null : string.Join(", ", missing);
    }

    private object?[] BuildDoActionOnLoadedArgs(Window designer, Action action)
    {
        var parameters = _doActionOnLoadedMethod!.GetParameters();
        return parameters.Length switch
        {
            2 => new object?[] { designer, action },
            >= 3 => new object?[] { designer, action, 0 },
            _ => new object?[] { designer, action },
        };
    }

    private object? FindVariable(Window designer, string variableKey)
    {
        var variableListProperty = _designerWindowType!.GetProperty(
            "VariableList",
            BindingFlags.Public | BindingFlags.Instance);
        if (variableListProperty is null)
        {
            return null;
        }

        if (variableListProperty.GetValue(designer) is not System.Collections.IEnumerable variables)
        {
            return null;
        }

        foreach (var variable in variables)
        {
            if (variable is null || !_actionVariableType!.IsInstanceOfType(variable))
            {
                continue;
            }

            var keyProperty = _actionVariableType.GetProperty("Key", BindingFlags.Public | BindingFlags.Instance);
            var key = keyProperty?.GetValue(variable) as string;
            if (string.Equals(key, variableKey, StringComparison.Ordinal))
            {
                return variable;
            }
        }

        return null;
    }

    private static string DescribeTargetLabel(string targetKind)
    {
        return string.Equals(targetKind, QuickerRpcVariableTargetKinds.Action, StringComparison.Ordinal)
            ? "action"
            : "subprogram";
    }

    private static string? ReadDefaultValue(object variable)
    {
        var property = variable.GetType().GetProperty("DefaultValue", BindingFlags.Public | BindingFlags.Instance);
        return property?.GetValue(variable) as string;
    }

    private static void WriteDefaultValue(object variable, string value)
    {
        var property = variable.GetType().GetProperty("DefaultValue", BindingFlags.Public | BindingFlags.Instance);
        property?.SetValue(variable, value);
    }

    private static Window? GetForegroundWpfWindow()
    {
        var handle = GetForegroundWindow();
        if (handle == IntPtr.Zero)
        {
            return null;
        }

        return HwndSource.FromHwnd(handle)?.RootVisual as Window;
    }

    private static QuickerRpcSubProgramVariableEditResult Fail(
        string? targetIdOrName,
        string? targetKind,
        string? variableKey,
        string? newValue,
        string message)
    {
        return new QuickerRpcSubProgramVariableEditResult
        {
            Ok = false,
            TargetKind = targetKind,
            SubProgramIdOrName = targetIdOrName,
            VariableKey = variableKey,
            NewValue = newValue,
            Message = message,
        };
    }

    private static MethodInfo? TryFindExtensionMethod(string methodName, params Type[] parameterTypes)
    {
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            MethodInfo? match = null;
            try
            {
                match = assembly.GetTypes()
                    .Where(t => t.IsSealed && t.IsAbstract && !t.IsGenericType)
                    .SelectMany(t => t.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic))
                    .FirstOrDefault(m =>
                        string.Equals(m.Name, methodName, StringComparison.Ordinal)
                        && m.IsDefined(typeof(System.Runtime.CompilerServices.ExtensionAttribute), false)
                        && ParametersMatch(m.GetParameters(), parameterTypes));
            }
            catch (ReflectionTypeLoadException ex)
            {
                match = ex.Types
                    .Where(t => t is not null)
                    .SelectMany(t => t!.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic))
                    .FirstOrDefault(m =>
                        string.Equals(m.Name, methodName, StringComparison.Ordinal)
                        && m.IsDefined(typeof(System.Runtime.CompilerServices.ExtensionAttribute), false)
                        && ParametersMatch(m.GetParameters(), parameterTypes));
            }

            if (match is not null)
            {
                return match;
            }
        }

        return null;
    }

    private static bool ParametersMatch(ParameterInfo[] parameters, Type[] expected)
    {
        if (parameters.Length != expected.Length)
        {
            return false;
        }

        for (var i = 0; i < expected.Length; i++)
        {
            if (!expected[i].IsAssignableFrom(parameters[i].ParameterType))
            {
                return false;
            }
        }

        return true;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
}
