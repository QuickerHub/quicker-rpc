using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading;
using System.Windows;
using Quicker.Actions.XActions.BuildinRunners;
using Quicker.Domain.Actions;
using Quicker.Domain.Actions.X.Storage;
using Quicker.Modules.TextTools;
using Quicker.Utilities;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Quicker;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Runs Quicker param-editor text tools (TextToolsProvider) for the web action designer via qkrpc.
/// Mirrors <c>TextToolsStepV2.ExecuteInternal</c>.
/// </summary>
public sealed class TextToolRunService
{
    private const int DefaultTimeoutMs = 300_000;

    private static readonly MethodInfo? GetToolMethod = ResolveGetToolMethod();

    public QuickerRpcTextToolRunResult Run(string toolId, string? currentValue, int timeoutMs = DefaultTimeoutMs)
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return Fail("NOT_IN_QUICKER", "Not running inside Quicker.");
        }

        var id = (toolId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return Fail("MISSING_TOOL", "toolId is required.");
        }

        if (!Enum.TryParse(id, ignoreCase: false, out TextToolType toolType)
            || toolType == TextToolType.Na)
        {
            return Fail("UNSUPPORTED_TOOL", $"Unsupported text tool: {id}");
        }

        if (GetToolMethod is null)
        {
            return Fail("PROVIDER_UNAVAILABLE", "TextToolsProvider is unavailable.");
        }

        var toolItem = GetToolMethod.Invoke(null, new object[] { toolType });
        if (toolItem is null)
        {
            return Fail("UNSUPPORTED_TOOL", $"Text tool not registered: {id}");
        }

        if (toolItem is not TextToolItem item || item.CreateToolFunc is null)
        {
            return Fail("TOOL_CREATE_FAILED", "Text tool factory is unavailable.");
        }

        var waitMs = timeoutMs > 0 ? timeoutMs : DefaultTimeoutMs;
        var done = false;
        string? result = string.Empty;
        var cancelled = false;

        var context = new TextToolContext
        {
            ParentWindow = ActionDesignerContext.TryGetForegroundDesigner(),
            ActionVariables = new List<ActionVariable>(),
            ProcessSelectedTextFunc = (text, _) =>
            {
                done = true;
                result = text;
            },
            SelectionCanceledFunc = () =>
            {
                done = true;
                cancelled = true;
                result = null;
            },
            TextControl = new VirtualTextControl(currentValue ?? string.Empty),
        };

        var selector = item.CreateToolFunc(context);
        if (selector is null)
        {
            return Fail("TOOL_CREATE_FAILED", "Could not create text tool instance.");
        }

        selector.ForStepUse = true;

        AppHelper.RunOnUiThread(
            true,
            () =>
            {
                selector.OnMouseDown(true);
                selector.OnMouseUp(null);
            });

        var deadline = Environment.TickCount + waitMs;
        while (!done && Environment.TickCount < deadline)
        {
            Thread.Sleep(20);
        }

        if (!done)
        {
            return Fail("TIMEOUT", "Text tool timed out waiting for user input.");
        }

        if (cancelled || result is null)
        {
            return new QuickerRpcTextToolRunResult
            {
                Ok = true,
                Cancelled = true,
                Message = "Selection cancelled.",
            };
        }

        return new QuickerRpcTextToolRunResult
        {
            Ok = true,
            Cancelled = false,
            Value = result,
            Message = string.Empty,
        };
    }

    private static MethodInfo? ResolveGetToolMethod()
    {
        var providerType = typeof(TextToolType).Assembly.GetType(
            "Quicker.Modules.TextTools.TextToolsProvider",
            throwOnError: false);
        return providerType?.GetMethod(
            "GetTool",
            BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public);
    }

    private static QuickerRpcTextToolRunResult Fail(string code, string message) =>
        new()
        {
            Ok = false,
            ErrorCode = code,
            Message = message,
        };
}
