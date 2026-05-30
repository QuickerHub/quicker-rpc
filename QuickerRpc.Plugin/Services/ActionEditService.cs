using System;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Opens the Quicker action editor via AppState.AppServer.EditActionById (reflection).
/// </summary>
public sealed class ActionEditService
{
    private readonly Func<string, bool>? _editById;

    public ActionEditService()
    {
        _editById = TryCreateEditDelegate();
    }

    public QuickerRpcActionUpdateResult EditAction(string actionId)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                Message = "actionId is required.",
            };
        }

        if (_editById is null)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = id,
                Message = "Not running inside Quicker (EditActionById unavailable).",
            };
        }

        try
        {
            var opened = _editById(id);
            return new QuickerRpcActionUpdateResult
            {
                Ok = opened,
                ActionId = id,
                Message = opened ? "动作编辑窗口已打开。" : "无法打开动作编辑窗口。",
            };
        }
        catch (Exception ex)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = id,
                Message = ex.Message,
            };
        }
    }

    private static Func<string, bool>? TryCreateEditDelegate()
    {
        if (!IsInQuicker())
        {
            return null;
        }

        if (TryCreateAppServerEditDelegate(out var fromAppServer))
        {
            return fromAppServer;
        }

        return TryCreateEditorLauncherEditDelegate(out var fromLauncher) ? fromLauncher : null;
    }

    private static bool TryCreateAppServerEditDelegate(out Func<string, bool> edit)
    {
        edit = null!;

        try
        {
            var appServer = typeof(AppState).GetProperty("AppServer", BindingFlags.Public | BindingFlags.Static)
                ?.GetValue(null);
            if (appServer is null)
            {
                return false;
            }

            var method = appServer.GetType().GetMethod(
                "EditActionById",
                BindingFlags.Public | BindingFlags.Instance,
                binder: null,
                types: new[] { typeof(string) },
                modifiers: null);
            if (method is null)
            {
                return false;
            }

            edit = id =>
            {
                method.Invoke(appServer, new object[] { id });
                return true;
            };
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryCreateEditorLauncherEditDelegate(out Func<string, bool> edit)
    {
        edit = null!;

        try
        {
            var launcherType = typeof(AppState).Assembly.GetType(
                "Quicker.Modules.ActionManagement.Services.ActionEditorLauncher",
                throwOnError: false);
            if (launcherType is null)
            {
                return false;
            }

            var getService = typeof(AppState).GetMethod(
                "GetService",
                BindingFlags.Public | BindingFlags.Static,
                binder: null,
                types: new[] { typeof(Type) },
                modifiers: null);
            var launcher = getService?.Invoke(null, new object[] { launcherType });
            if (launcher is null)
            {
                return false;
            }

            var method = launcherType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(m =>
                    string.Equals(m.Name, "EditActionById", StringComparison.Ordinal)
                    && m.GetParameters().Length >= 1
                    && m.GetParameters()[0].ParameterType == typeof(string));
            if (method is null)
            {
                return false;
            }

            edit = id =>
            {
                var parameters = method.GetParameters();
                object?[] args = parameters.Length switch
                {
                    1 => new object?[] { id },
                    2 => new object?[] { id, null },
                    _ => new object?[] { id, null, false },
                };
                method.Invoke(launcher, args);
                return true;
            };
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool IsInQuicker()
    {
        return Assembly.GetEntryAssembly()?.GetName().Name == "Quicker";
    }
}
