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
/// Injects plugin step runners. <c>sys:evalexpression</c> uses plugin backfill with typed
/// Z.Expressions globals (built-in EvalExpressionStepV2 uses dynamic variable bags).
/// </summary>
internal static class StepRunnerRegistration
{
    private static readonly object LockObject = new();
    private static bool _registered;

    internal static IStepRunner? TryGetRunner(string key) =>
        string.IsNullOrWhiteSpace(key) ? null : GetRuntimeRunner(key);

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

        var existing = GetRuntimeRunner(key);
        if (existing is EvalExpressionStepRunner)
        {
            return;
        }

        var backfill = new EvalExpressionStepRunner();
        InstallRuntimeRunner(key, backfill);

        if (existing is null)
        {
            logger?.LogInformation(
                "Registered plugin {Key} with typed Z.Expressions globals.",
                key);
            return;
        }

        logger?.LogInformation(
            "Replaced step runner {Key} ({OldType}) with plugin EvalExpressionStepRunner (typed globals).",
            key,
            existing.GetType().Name);
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
