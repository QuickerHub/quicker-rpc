using System;
using Microsoft.Extensions.Logging;
using Quicker.Domain.Actions.X.StepRunners;
using QuickerRpc.Plugin.Reflection;
using QuickerRpc.Plugin.StepRunners;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Injects plugin step runners via Quicker <see cref="StepRunnerRegistry"/>.
/// See <c>.ref/Quicker/QuickerPc/Quicker/Actions/XActions/StepRunners/StepRunnerRegistry.cs</c>.
/// </summary>
internal static class StepRunnerRegistration
{
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
            if (_registered)
            {
                return;
            }

            try
            {
                RegisterEvalExpression(logger);
                _registered = true;
            }
            catch (Exception ex)
            {
                logger?.LogWarning(ex, "Plugin step runner registration failed.");
            }
        }
    }

    private static void RegisterEvalExpression(ILogger? logger)
    {
        var runner = new EvalExpressionStepRunner();
        var key = EvalExpressionStepRunner.StepKey;
        var existed = StepRunnerRegistry.GetRunner(key) is not null;

        // Register() throws on duplicate; indexer overwrites existing entry.
        StepRunnerRegistry.Runners[key] = runner;

        logger?.LogInformation(
            existed
                ? "Replaced step runner {Key} via StepRunnerRegistry."
                : "Registered plugin step runner {Key} via StepRunnerRegistry.",
            key);
    }
}
