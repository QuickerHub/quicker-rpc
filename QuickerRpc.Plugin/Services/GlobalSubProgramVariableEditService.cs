using System;
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
/// Edits default values of variables in global subprograms via ActionDesignerWindow UI automation.
/// Ported from wpf-demos/quicker-modifier ActionEditService.EditVarVersionAsync.
/// </summary>
public sealed class GlobalSubProgramVariableEditService
{
    private readonly object? _actionEditMgr;
    private readonly MethodInfo? _createOrEditGlobalSubProgramMethod;
    private readonly Type? _designerWindowType;
    private readonly MethodInfo? _doActionOnLoadedMethod;
    private readonly MethodInfo? _triggerClickMethod;
    private readonly Type? _actionVariableType;

    public GlobalSubProgramVariableEditService()
    {
        _actionEditMgr = TryGetActionEditMgr(out _createOrEditGlobalSubProgramMethod);
        _designerWindowType = typeof(AppState).Assembly.GetType("Quicker.View.X.ActionDesignerWindow", throwOnError: false);
        _actionVariableType = typeof(AppState).Assembly.GetType("Quicker.Domain.Actions.ActionVariable", throwOnError: false)
            ?? typeof(AppState).Assembly.GetType("Quicker.Domain.Actions.X.ActionVariable", throwOnError: false);
        _doActionOnLoadedMethod = TryFindExtensionMethod("DoActionOnLoaded", typeof(Window), typeof(Action));
        _triggerClickMethod = TryFindExtensionMethod("TriggerClick", typeof(Button));
    }

    public async Task<QuickerRpcSubProgramVariableEditResult> EditVariableAsync(
        string subProgramIdOrName,
        string variableKey,
        string defaultValue)
    {
        var idOrName = (subProgramIdOrName ?? string.Empty).Trim();
        var key = (variableKey ?? string.Empty).Trim();
        var value = defaultValue ?? string.Empty;

        if (string.IsNullOrWhiteSpace(idOrName))
        {
            return Fail(null, null, null, "subProgramIdOrName is required.");
        }

        if (string.IsNullOrWhiteSpace(key))
        {
            return Fail(idOrName, null, null, "variableKey is required.");
        }

        if (_actionEditMgr is null
            || _createOrEditGlobalSubProgramMethod is null
            || _designerWindowType is null
            || _doActionOnLoadedMethod is null
            || _triggerClickMethod is null
            || _actionVariableType is null)
        {
            return Fail(
                idOrName,
                key,
                value,
                "Not running inside Quicker (global subprogram editor unavailable).");
        }

        object? subProgram;
        try
        {
            subProgram = AppState.DataService.GetGlobalSubProgram(idOrName);
        }
        catch (Exception ex)
        {
            return Fail(idOrName, key, value, ex.Message);
        }

        if (subProgram is null)
        {
            return Fail(idOrName, key, value, $"Global subprogram not found: {idOrName}");
        }

        try
        {
            _createOrEditGlobalSubProgramMethod.Invoke(_actionEditMgr, new[] { subProgram });
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            return Fail(idOrName, key, value, ex.InnerException.Message);
        }
        catch (Exception ex)
        {
            return Fail(idOrName, key, value, ex.Message);
        }

        Window? designer = null;
        for (var i = 0; i < 30; i++)
        {
            designer = GetForegroundWpfWindow();
            if (designer is not null && _designerWindowType.IsInstanceOfType(designer))
            {
                break;
            }

            designer = null;
            await Task.Delay(100).ConfigureAwait(true);
        }

        if (designer is null || !_designerWindowType.IsInstanceOfType(designer))
        {
            return Fail(idOrName, key, value, "ActionDesignerWindow did not open in time.");
        }

        await Task.Delay(200).ConfigureAwait(true);

        string? oldValue = null;
        var saved = false;
        var notFound = false;

        try
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                _doActionOnLoadedMethod.Invoke(
                    null,
                    new object?[] { designer, (Action)(() =>
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
                            _triggerClickMethod.Invoke(null, new object[] { saveButton });
                        }
                    }), 0 });
            });
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            return Fail(idOrName, key, value, ex.InnerException.Message);
        }
        catch (Exception ex)
        {
            return Fail(idOrName, key, value, ex.Message);
        }

        if (notFound)
        {
            return Fail(idOrName, key, value, $"Variable '{key}' not found in subprogram '{idOrName}'.");
        }

        if (!saved)
        {
            return Fail(idOrName, key, value, "Failed to update variable default value.");
        }

        var message = string.IsNullOrWhiteSpace(oldValue)
            ? $"变量 {key} 已设为 {value}"
            : $"变量 {key} 变更 {oldValue} => {value}";

        return new QuickerRpcSubProgramVariableEditResult
        {
            Ok = true,
            SubProgramIdOrName = idOrName,
            VariableKey = key,
            OldValue = oldValue,
            NewValue = value,
            Message = message,
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
        string? subProgramIdOrName,
        string? variableKey,
        string? newValue,
        string message)
    {
        return new QuickerRpcSubProgramVariableEditResult
        {
            Ok = false,
            SubProgramIdOrName = subProgramIdOrName,
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

    private static object? TryGetActionEditMgr(out MethodInfo? createOrEditGlobalSubProgramMethod)
    {
        createOrEditGlobalSubProgramMethod = null;
        if (!IsInQuicker())
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

            createOrEditGlobalSubProgramMethod = mgrType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(m =>
                    string.Equals(m.Name, "CreateOrEditGlobalSubProgram", StringComparison.Ordinal)
                    && m.GetParameters().Length == 1);

            return createOrEditGlobalSubProgramMethod is null ? null : mgr;
        }
        catch
        {
            return null;
        }
    }

    private static bool IsInQuicker()
    {
        return Assembly.GetEntryAssembly()?.GetName().Name == "Quicker";
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
}
