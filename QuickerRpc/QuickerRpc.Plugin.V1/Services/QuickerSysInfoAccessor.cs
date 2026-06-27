using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Common;
using Quicker.Domain;
using Quicker.Domain.Actions;
using Quicker.Domain.Actions.X;
using Quicker.Domain.Actions.X.StepRunners;
using Quicker.Domain.Actions.X.Storage;
using Quicker.Public.Actions;
using Quicker.Public.Entities;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Reads Quicker identity via <c>DataService</c> union-id accessor (same source as <c>sys:getSysInfo</c> / <c>unionId</c>).
/// </summary>
internal static class QuickerSysInfoAccessor
{
    private const string StepKey = "sys:getSysInfo";

    private const string GetSysInfoStepTypeName =
        "Quicker.Domain.Actions.X.BuiltinRunners.GetSysInfoStep";

    public sealed class SysInfoSnapshot
    {
        public string? UnionId { get; set; }

        public string? UserName { get; set; }

        public bool? IsPro { get; set; }
    }

    public static SysInfoSnapshot? TryRead()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        try
        {
            var unionId = TryReadUnionIdFromDataService();
            if (!string.IsNullOrWhiteSpace(unionId))
            {
                return new SysInfoSnapshot
                {
                    UnionId = unionId,
                };
            }

            return TryReadViaGetSysInfoStep();
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Same value as <c>sys:getSysInfo</c> output <c>unionId</c> (<c>DataService.UJm6DcuniCs()</c> in current Quicker builds).
    /// </summary>
    private static string? TryReadUnionIdFromDataService()
    {
        var dataService = AppState.DataService;
        if (dataService is null)
        {
            return null;
        }

        foreach (var method in EnumerateUnionIdMethodCandidates(dataService))
        {
            try
            {
                if (method.Invoke(dataService, null) is not string text)
                {
                    continue;
                }

                var trimmed = text.Trim();
                if (!string.IsNullOrEmpty(trimmed))
                {
                    return trimmed;
                }
            }
            catch
            {
                // Try the next candidate accessor.
            }
        }

        return null;
    }

    private static IEnumerable<MethodInfo> EnumerateUnionIdMethodCandidates(object dataService)
    {
        return dataService.GetType()
            .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
            .Where(method =>
                !method.IsStatic
                && method.ReturnType == typeof(string)
                && method.GetParameters().Length == 0
                && !method.IsSpecialName
                && method.Name.IndexOf("uni", StringComparison.OrdinalIgnoreCase) >= 0)
            .OrderBy(method => method.Name.Length);
    }

    private static SysInfoSnapshot? TryReadViaGetSysInfoStep()
    {
        var runner = ResolveGetSysInfoRunner();
        if (runner is null)
        {
            return null;
        }

        var context = TryCreateHeadlessContext();
        if (context is null)
        {
            return null;
        }

        var step = new ActionStep
        {
            StepRunnerKey = StepKey,
        };
        step.OutputParams["unionId"] = "unionId";
        step.OutputParams["userName"] = "userName";
        step.OutputParams["isPro"] = "isPro";

        var action = CreateCaptureAction();

        try
        {
            runner.Execute(step, context, action, string.Empty);
        }
        catch
        {
            return null;
        }

        var variables = context.GetVariables();
        var unionId = ReadText(variables, "unionId")
            ?? ReadText(context.CustomData, "unionId")
            ?? ReadObjectText(context.TryGetValue("unionId", null));
        if (string.IsNullOrWhiteSpace(unionId))
        {
            return null;
        }

        return new SysInfoSnapshot
        {
            UnionId = unionId,
            UserName = ReadText(variables, "userName")
                ?? ReadText(context.CustomData, "userName")
                ?? ReadObjectText(context.TryGetValue("userName", null)),
            IsPro = ReadBool(variables, "isPro")
                ?? ReadBool(context.CustomData, "isPro"),
        };
    }

    private static XAction CreateCaptureAction()
    {
        var action = new XAction();
        action.Variables.Add(CreateVariable("unionId", VarType.Text));
        action.Variables.Add(CreateVariable("userName", VarType.Text));
        action.Variables.Add(CreateVariable("isPro", VarType.Boolean));
        return action;
    }

    private static ActionVariable CreateVariable(string key, VarType type) =>
        new()
        {
            Key = key,
            Type = type,
        };

    private static string? ReadObjectText(object? raw)
    {
        if (raw is null)
        {
            return null;
        }

        var text = raw.ToString()?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    private static IStepRunner? ResolveGetSysInfoRunner()
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

        return TryCreateBuiltInGetSysInfoRunner();
    }

    private static IStepRunner? TryCreateBuiltInGetSysInfoRunner()
    {
        var assembly = typeof(AppState).Assembly;
        var stepType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, GetSysInfoStepTypeName);
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

    private static ActionExecuteContext? TryCreateHeadlessContext()
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

            return new ActionExecuteContext(
                actionItem,
                null,
                appServer,
                false,
                0,
                new ActionExtraContextData(),
                null);
        }
        catch
        {
            return null;
        }
    }

    private static string? ReadText(IDictionary<string, object> variables, string key)
    {
        if (!variables.TryGetValue(key, out var raw) || raw is null)
        {
            return null;
        }

        var text = raw.ToString()?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    private static bool? ReadBool(IDictionary<string, object>? variables, string key)
    {
        if (variables is null)
        {
            return null;
        }

        return ReadBoolCore(variables, key);
    }

    private static bool? ReadBoolCore(IDictionary<string, object> variables, string key)
    {
        if (!variables.TryGetValue(key, out var raw) || raw is null)
        {
            return null;
        }

        return raw switch
        {
            bool b => b,
            _ => bool.TryParse(raw.ToString(), out var parsed) ? parsed : null,
        };
    }
}
