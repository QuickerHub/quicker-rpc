using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using Quicker.Domain;
using Quicker.Domain.Actions;
using Quicker.Domain.Actions.Runtime;
using Quicker.Domain.Actions.X;
using Quicker.Domain.Actions.X.StepRunners;
using Quicker.Domain.Actions.X.Storage;
using Quicker.Public.Actions;
using Quicker.Public.Entities;
using Quicker.Utilities._3rd.Chrome;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Headless <c>sys:chromecontrol</c> for agents — runs Quicker's ChromeControlStepV2 inside the plugin process.
/// </summary>
public sealed class ChromeControlExecuteService
{
    private const string StepKey = "sys:chromecontrol";

    private const string RunnerTypeName =
        "Quicker.Domain.Actions.X.BuiltinRunners.ChromeControlStepV2";

    private static readonly ConcurrentDictionary<string, ChromeControlSessionState> Sessions =
        new(StringComparer.Ordinal);

    private static readonly string[] OutputKeys =
    {
        "isSuccess",
        "tabId",
        "windowId",
        "groupId",
        "url",
        "title",
        "favicon",
        "rawResponse",
        "browser",
        "extVersion",
        "manifestVersion",
        "envName",
        "firstValue",
        "allValues",
        "selector",
    };

    public QuickerRpcChromeControlResult Execute(
        string operation,
        string? parametersJson,
        string? sessionId)
    {
        var op = (operation ?? string.Empty).Trim();
        if (op.Length == 0)
        {
            return Fail("MISSING_OPERATION", "operation is required.");
        }

        if (!QuickerHost.IsRunningInQuicker())
        {
            return Fail("NOT_IN_QUICKER", "Not running inside Quicker.");
        }

        var sid = NormalizeSessionId(sessionId);
        var session = Sessions.GetOrAdd(sid, _ => new ChromeControlSessionState());

        if (!TryParseParameters(parametersJson, out var inputs, out var parseError))
        {
            return Fail("INVALID_PARAMETERS", parseError ?? "parametersJson is invalid.");
        }

        if (!inputs.ContainsKey("operation"))
        {
            inputs["operation"] = op;
        }

        InjectSessionTabIdIfMissing(inputs, session);

        var runner = ResolveChromeControlRunner();
        if (runner is null)
        {
            return Fail("RUNNER_UNAVAILABLE", "sys:chromecontrol step runner is unavailable.");
        }

        var context = TryCreateHeadlessContext(session);
        if (context is null)
        {
            return Fail("CONTEXT_UNAVAILABLE", "Could not create action execution context.");
        }

        var action = CreateCaptureAction();
        var step = BuildStep(inputs);

        try
        {
            runner.Execute(step, context, action, string.Empty);
        }
        catch (Exception ex)
        {
            return Fail("EXECUTE_ERROR", ex.Message, op, sid);
        }

        if (context.TargetBrowser is not null)
        {
            session.TargetBrowser = context.TargetBrowser;
        }

        var outputs = ReadOutputs(context);
        var success = ReadBool(outputs, "isSuccess") != false
            && string.IsNullOrEmpty(context.ErrorMessage);

        if (!success)
        {
            var message = context.ErrorMessage
                ?? ReadText(outputs, "rawResponse")
                ?? "ChromeControl operation failed.";
            return new QuickerRpcChromeControlResult
            {
                Ok = true,
                Success = false,
                ErrorCode = "OPERATION_FAILED",
                Message = message,
                Operation = op,
                SessionId = sid,
                OutputsJson = SerializeOutputs(outputs),
            };
        }

        var tabId = ReadInt(outputs, "tabId");
        if (tabId.HasValue)
        {
            session.LastTabId = tabId;
        }

        return new QuickerRpcChromeControlResult
        {
            Ok = true,
            Success = true,
            Message = string.Empty,
            Operation = op,
            SessionId = sid,
            TabId = tabId ?? session.LastTabId,
            WindowId = ReadInt(outputs, "windowId"),
            Url = ReadText(outputs, "url"),
            Title = ReadText(outputs, "title"),
            Browser = ReadText(outputs, "browser"),
            RawResponseJson = outputs.TryGetValue("rawResponse", out var raw)
                ? SerializeRawResponse(raw)
                : null,
            OutputsJson = SerializeOutputs(outputs),
        };
    }

    public QuickerRpcChromeControlTabsResult ListTabs()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return new QuickerRpcChromeControlTabsResult
            {
                Ok = false,
                ErrorCode = "NOT_IN_QUICKER",
                Message = "Not running inside Quicker.",
            };
        }

        try
        {
            var tabs = ChromeControl.GetCurrentTabs();
            var items = tabs
                .Select(MapTab)
                .ToList();

            return new QuickerRpcChromeControlTabsResult
            {
                Ok = true,
                Message = string.Empty,
                Items = items,
            };
        }
        catch (Exception ex)
        {
            return new QuickerRpcChromeControlTabsResult
            {
                Ok = false,
                ErrorCode = "LIST_TABS_ERROR",
                Message = ex.Message,
            };
        }
    }

    private static QuickerRpcChromeControlTabItem MapTab(BrowserTabInfo tab) =>
        new()
        {
            TabId = tab.TabId,
            WindowId = tab.WindowId,
            Title = tab.Title,
            Url = tab.Url,
            Status = tab.Status,
            Browser = tab.BrowserProcName,
            BrowserProcId = tab.BrowserProcId,
            Incognito = tab.Incognito,
        };

    private static string NormalizeSessionId(string? sessionId)
    {
        var sid = (sessionId ?? string.Empty).Trim();
        return sid.Length == 0 ? "default" : sid;
    }

    private static void InjectSessionTabIdIfMissing(
        Dictionary<string, string?> inputs,
        ChromeControlSessionState session)
    {
        if (session.LastTabId is null)
        {
            return;
        }

        if (inputs.ContainsKey("tabId") || inputs.ContainsKey("tabId.var"))
        {
            return;
        }

        inputs["tabId"] = session.LastTabId.Value.ToString(CultureInfo.InvariantCulture);
    }

    private static bool TryParseParameters(
        string? parametersJson,
        out Dictionary<string, string?> inputs,
        out string? error)
    {
        inputs = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        error = null;

        if (string.IsNullOrWhiteSpace(parametersJson))
        {
            return true;
        }

        try
        {
            var token = JToken.Parse(parametersJson);
            if (token is not JObject obj)
            {
                error = "parametersJson must be a JSON object.";
                return false;
            }

            foreach (var prop in obj.Properties())
            {
                inputs[prop.Name] = TokenToParamString(prop.Value);
            }

            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static string? TokenToParamString(JToken token) =>
        token.Type switch
        {
            JTokenType.Null => null,
            JTokenType.Boolean => token.Value<bool>() ? "true" : "false",
            JTokenType.Integer => token.Value<long>().ToString(CultureInfo.InvariantCulture),
            JTokenType.Float => token.Value<double>().ToString(CultureInfo.InvariantCulture),
            JTokenType.String => token.Value<string>(),
            _ => token.ToString(Formatting.None),
        };

    private static ActionStep BuildStep(IReadOnlyDictionary<string, string?> inputs)
    {
        var step = new ActionStep
        {
            StepRunnerKey = StepKey,
        };

        foreach (var kv in inputs)
        {
            var key = kv.Key;
            if (key.EndsWith(".var", StringComparison.OrdinalIgnoreCase))
            {
                var baseKey = key[..^4];
                step.InputParams[baseKey] = new ActionStepParam
                {
                    VarKey = kv.Value ?? string.Empty,
                };
            }
            else
            {
                step.InputParams[key] = new ActionStepParam
                {
                    Value = kv.Value ?? string.Empty,
                };
            }
        }

        foreach (var outputKey in OutputKeys)
        {
            step.OutputParams[outputKey] = outputKey;
        }

        return step;
    }

    private static XAction CreateCaptureAction()
    {
        var action = new XAction();
        foreach (var key in OutputKeys)
        {
            action.Variables.Add(new ActionVariable
            {
                Key = key,
                Type = key is "tabId" or "windowId" or "groupId" or "manifestVersion"
                    ? VarType.Integer
                    : key is "isSuccess"
                        ? VarType.Boolean
                        : key is "allValues"
                            ? VarType.List
                            : VarType.Text,
            });
        }

        return action;
    }

    private static ActionExecuteContext? TryCreateHeadlessContext(ChromeControlSessionState session)
    {
        try
        {
            var appServer = AppState.AppServer;
            if (appServer is null)
            {
                return null;
            }

            var actionItem = ActionTypeManager.CreateActionItem(ActionType.XAction);
            if (actionItem is null)
            {
                return null;
            }

            var context = new ActionExecuteContext(
                actionItem,
                null,
                appServer,
                false,
                0,
                new ActionExtraContextData(),
                null);

            if (session.TargetBrowser is not null)
            {
                context.TargetBrowser = session.TargetBrowser;
            }

            return context;
        }
        catch
        {
            return null;
        }
    }

    private static Dictionary<string, object?> ReadOutputs(ActionExecuteContext context)
    {
        var map = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var variables = context.GetVariables();
        foreach (var key in OutputKeys)
        {
            if (variables.TryGetValue(key, out var value))
            {
                map[key] = value;
            }
            else if (context.TryGetValue(key, null) is { } direct)
            {
                map[key] = direct;
            }
        }

        return map;
    }

    private static IStepRunner? ResolveChromeControlRunner()
    {
        var service = ResolveStepRunnerService();
        if (service is not null)
        {
            var fromService = TryGetRunnerFromService(service, StepKey);
            if (fromService is not null)
            {
                return fromService;
            }
        }

        var fromRegistry = StepRunnerRegistry.GetRunner(StepKey);
        if (fromRegistry is not null)
        {
            return fromRegistry;
        }

        return TryCreateBuiltInRunner();
    }

    private static IStepRunner? TryCreateBuiltInRunner()
    {
        var assembly = typeof(AppState).Assembly;
        var stepType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, RunnerTypeName);
        if (stepType is null || !typeof(IStepRunner).IsAssignableFrom(stepType))
        {
            return null;
        }

        try
        {
            return Activator.CreateInstance(stepType) as IStepRunner;
        }
        catch
        {
            return null;
        }
    }

    private static object? ResolveStepRunnerService()
    {
        var prop = typeof(AppState).GetProperty(
            "StepRunnerService",
            BindingFlags.Public | BindingFlags.Static);
        var service = prop?.GetValue(null);
        if (service is not null)
        {
            return service;
        }

        var serviceType = typeof(AppState).Assembly.GetType(
            "Quicker.Domain.Actions.X.StepRunners.IStepRunnerService",
            throwOnError: false);
        return serviceType is null ? null : QuickerInternalAccess.TryGetService(serviceType);
    }

    private static IStepRunner? TryGetRunnerFromService(object service, string key)
    {
        var getRunner = service.GetType().GetMethod(
            "GetRunner",
            BindingFlags.Public | BindingFlags.Instance,
            binder: null,
            types: new[] { typeof(string) },
            modifiers: null);
        return getRunner?.Invoke(service, new object[] { key }) as IStepRunner;
    }

    private static string? SerializeRawResponse(object? raw)
    {
        if (raw is null)
        {
            return null;
        }

        if (raw is JToken jt)
        {
            return jt.ToString(Formatting.None);
        }

        try
        {
            return JsonConvert.SerializeObject(raw);
        }
        catch
        {
            return raw.ToString();
        }
    }

    private static string? SerializeOutputs(IReadOnlyDictionary<string, object?> outputs)
    {
        if (outputs.Count == 0)
        {
            return null;
        }

        var dict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (var kv in outputs)
        {
            dict[kv.Key] = kv.Value is JToken jt ? jt : kv.Value;
        }

        return JsonConvert.SerializeObject(dict);
    }

    private static string? ReadText(IReadOnlyDictionary<string, object?> map, string key)
    {
        if (!map.TryGetValue(key, out var raw) || raw is null)
        {
            return null;
        }

        if (raw is JToken jt)
        {
            return jt.Type == JTokenType.String ? jt.Value<string>() : jt.ToString(Formatting.None);
        }

        var text = raw.ToString()?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    private static int? ReadInt(IReadOnlyDictionary<string, object?> map, string key)
    {
        if (!map.TryGetValue(key, out var raw) || raw is null)
        {
            return null;
        }

        return raw switch
        {
            int i => i,
            long l => (int)l,
            JValue { Type: JTokenType.Integer } jv => jv.Value<int>(),
            _ => int.TryParse(raw.ToString(), out var parsed) ? parsed : null,
        };
    }

    private static bool? ReadBool(IReadOnlyDictionary<string, object?> map, string key)
    {
        if (!map.TryGetValue(key, out var raw) || raw is null)
        {
            return null;
        }

        return raw switch
        {
            bool b => b,
            JValue { Type: JTokenType.Boolean } jv => jv.Value<bool>(),
            _ => bool.TryParse(raw.ToString(), out var parsed) ? parsed : null,
        };
    }

    private static QuickerRpcChromeControlResult Fail(
        string errorCode,
        string message,
        string? operation = null,
        string? sessionId = null) =>
        new()
        {
            Ok = false,
            Success = false,
            ErrorCode = errorCode,
            Message = message,
            Operation = operation,
            SessionId = sessionId,
        };

    private sealed class ChromeControlSessionState
    {
        public TargetBrowserInfo? TargetBrowser { get; set; }

        public int? LastTabId { get; set; }
    }
}
