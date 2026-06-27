using System;
using System.Reflection;
using System.Windows;
using System.Windows.Threading;
using Newtonsoft.Json;
using Quicker.Domain.Actions.X;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Mirrors CeaQuicker <c>QuickerUtil.CurrentActionAccess</c> / <c>ActionEditor.SetAction</c>:
/// assign <c>ActionDesignerWindow.Action</c> from JSON, then invoke update via obfuscated method name
/// (<c>CheckIfCanSave</c> + 6, resolved once like <c>ActionEditor.MethodName</c>).
/// </summary>
internal static class ActionDesignerCurrentActionAccess
{
    private static readonly BindingFlags InstanceAll =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    /// <summary>CeaQuicker option "2": <c>editor.SetAction(str_action)</c>.</summary>
    public static bool TrySetActionDefinition(Window? designerHint, string json, out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(json))
        {
            error = "JSON is empty.";
            return false;
        }

        var ok = false;
        string? localError = null;

        void Body()
        {
            var designer = ResolveDesignerWindow(designerHint);
            if (designer is null)
            {
                localError = "未找到动作设计器窗口。";
                return;
            }

            if (!TryParseActionJson(json, out var xAction, out localError) || xAction is null)
            {
                return;
            }

            ActionDesignerReflection.TryUnlockReadOnly(designer, out _, out _);

            if (!TrySetActionAndUpdateCeaStyle(designer, xAction, out localError))
            {
                return;
            }

            ActionDesignerUiSave.TrySyncResultItemAfterPaste(designer);
            for (var i = 0; i < 8; i++)
            {
                ActionDesignerUiSave.PumpDispatcherOnce();
            }

            ok = true;
        }

        RunOnUiThread(Body);
        error = localError;
        return ok;
    }

    public static bool TrySetActionDefinition(Window? designerHint, XAction xAction, out string? error)
    {
        if (xAction is null)
        {
            error = "XAction is null.";
            return false;
        }

        return TrySetActionDefinition(
            designerHint,
            JsonConvert.SerializeObject(xAction),
            out error);
    }

    private static bool TrySetActionAndUpdateCeaStyle(Window designer, XAction xAction, out string? error)
    {
        error = null;
        var winType = designer.GetType();
        var actionProp = winType.GetProperty("Action", InstanceAll);
        if (actionProp is null || !actionProp.CanWrite)
        {
            error = "Designer Action property is not writable.";
            return false;
        }

        try
        {
            actionProp.SetValue(designer, xAction);
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }

        return QuickerActionDesignerReflection.TryInvokeUpdateXActionUiCeaStyle(designer, out error);
    }

    private static bool TryParseActionJson(string json, out XAction? xAction, out string? error)
    {
        error = null;
        xAction = TryJsonToObjectXAction(json);
        if (xAction is not null)
        {
            return true;
        }

        try
        {
            xAction = JsonConvert.DeserializeObject<XAction>(json);
            if (xAction is not null)
            {
                return true;
            }
        }
        catch (Exception ex)
        {
            error = "Invalid XAction JSON: " + ex.Message;
            return false;
        }

        if (ActionDesignerXActionImport.TryParse(json, out xAction, out error) && xAction is not null)
        {
            return true;
        }

        error ??= "Invalid XAction JSON.";
        return false;
    }

    private static XAction? TryJsonToObjectXAction(string json)
    {
        try
        {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                var extensionsType = assembly.GetType("Quicker.Public.Extensions.CommonExtensions", throwOnError: false);
                if (extensionsType is null)
                {
                    continue;
                }

                foreach (var method in extensionsType.GetMethods(BindingFlags.Public | BindingFlags.Static))
                {
                    if (!method.IsGenericMethodDefinition
                        || !string.Equals(method.Name, "JsonToObject", StringComparison.Ordinal))
                    {
                        continue;
                    }

                    var generic = method.MakeGenericMethod(typeof(XAction));
                    return generic.Invoke(null, new object[] { json }) as XAction;
                }
            }
        }
        catch
        {
            // Fall back to Newtonsoft.
        }

        return null;
    }

    private static Window? ResolveDesignerWindow(Window? _)
    {
        // CeaQuicker ActionEditor() always uses GetForeGroundWindow → ActionDesignerWindow.
        return ActionDesignerContext.TryGetForegroundDesigner();
    }

    private static void RunOnUiThread(Action action)
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null || dispatcher.CheckAccess())
        {
            action();
            return;
        }

        dispatcher.Invoke(action, DispatcherPriority.Normal);
    }
}
