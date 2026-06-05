using System;
using System.Collections.Generic;
using System.Reflection;
using Microsoft.Extensions.Logging;
using Quicker.Domain;
using Quicker.Domain.Actions.X.StepRunners;
using QuickerRpc.Plugin.Reflection;
using QuickerRpc.Plugin.StepRunners;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Injects plugin step runners. <c>sys:evalexpression</c> prefers built-in EvalExpressionStepV2;
/// otherwise registers plugin backfill (with Z.Expressions Split/LINQ rewrite).
/// </summary>
internal static class StepRunnerRegistration
{
    private const string BuiltInEvalExpressionTypeName =
        "Quicker.Domain.Actions.X.BuiltinRunners.Misc.EvalExpressionStepV2";

    private static readonly object LockObject = new();
    private static bool _registered;

    public static void RegisterPluginStepRunners(ILogger? logger = null)
    {
        if (!QuickerInternalAccess.IsInQuicker)
        {
            return;
        }

        lock (LockObject)
        {
            try
            {
                EnsureEvalExpressionRunner(logger);

                if (_registered)
                {
                    return;
                }

                _registered = true;
                StepRunnerCatalogFromQuicker.InvalidateCache();
            }
            catch (Exception ex)
            {
                logger?.LogWarning(ex, "Plugin step runner registration failed.");
            }
        }
    }

    private static void EnsureEvalExpressionRunner(ILogger? logger)
    {
        const string key = EvalExpressionStepRunner.StepKey;

        if (TryInstallBuiltInEvalExpression(logger, key))
        {
            return;
        }

        var existing = GetRuntimeRunner(key);
        if (existing is not null && existing is not EvalExpressionStepRunner)
        {
            logger?.LogInformation(
                "Step runner {Key} already provided by Quicker ({Type}).",
                key,
                existing.GetType().Name);
            return;
        }

        var backfill = new EvalExpressionStepRunner();
        InstallRuntimeRunner(key, backfill);
        logger?.LogInformation(
            "Registered plugin backfill for {Key} (built-in EvalExpressionStepV2 unavailable).",
            key);
    }

    private static bool TryInstallBuiltInEvalExpression(ILogger? logger, string key)
    {
        if (!TryCreateBuiltInEvalExpressionRunner(out var builtIn))
        {
            logger?.LogDebug("EvalExpressionStepV2 type not found; plugin backfill may be used.");
            return false;
        }

        var existing = GetRuntimeRunner(key);
        var builtInType = builtIn!.GetType();

        if (existing?.GetType() == builtInType)
        {
            return true;
        }

        InstallRuntimeRunner(key, builtIn!);

        if (existing is EvalExpressionStepRunner)
        {
            logger?.LogInformation(
                "Replaced plugin backfill with built-in EvalExpressionStepV2 for {Key}.",
                key);
        }
        else if (existing is null)
        {
            logger?.LogInformation("Registered built-in EvalExpressionStepV2 for {Key}.", key);
        }
        else
        {
            logger?.LogWarning(
                "Overwrote step runner {Key} ({OldType}) with built-in EvalExpressionStepV2.",
                key,
                existing.GetType().Name);
        }

        return true;
    }

    private static bool TryCreateBuiltInEvalExpressionRunner(out IStepRunner? runner)
    {
        runner = null;
        var type = ResolveBuiltInEvalExpressionType();
        if (type is null)
        {
            return false;
        }

        runner = Activator.CreateInstance(type) as IStepRunner;
        return runner is not null;
    }

    private static Type? ResolveBuiltInEvalExpressionType()
    {
        foreach (var assembly in new[] { typeof(AppState).Assembly })
        {
            var type = assembly.GetType(BuiltInEvalExpressionTypeName, throwOnError: false);
            if (type is not null)
            {
                return type;
            }
        }

        return Type.GetType($"{BuiltInEvalExpressionTypeName}, Quicker", throwOnError: false);
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

    private static IStepRunner? GetRuntimeRunner(string key)
    {
        var fromService = TryGetRunnerFromService(key);
        if (fromService is not null)
        {
            return fromService;
        }

        return StepRunnerRegistry.GetRunner(key);
    }

    private static IStepRunner? TryGetRunnerFromService(string key)
    {
        var service = ResolveStepRunnerService();
        if (service is null)
        {
            return null;
        }

        var getRunner = service.GetType().GetMethod(
            "GetRunner",
            BindingFlags.Public | BindingFlags.Instance,
            binder: null,
            types: new[] { typeof(string) },
            modifiers: null);
        return getRunner?.Invoke(service, new object[] { key }) as IStepRunner;
    }

    private static void InstallRuntimeRunner(string key, IStepRunner runner)
    {
        StepRunnerRegistry.Runners[key] = runner;
        TryInstallRunnerInStepRunnerService(key, runner);
    }

    private static void TryInstallRunnerInStepRunnerService(string key, IStepRunner runner)
    {
        var service = ResolveStepRunnerService();
        if (service is null)
        {
            return;
        }

        var field = service.GetType().GetField(
            "_runners",
            BindingFlags.Instance | BindingFlags.NonPublic);
        if (field?.GetValue(service) is IDictionary<string, IStepRunner> runners)
        {
            runners[key] = runner;
        }
    }
}
