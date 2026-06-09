using System.Text.Json;
using Quicker.ActionRuntime.Abstractions;
using Quicker.ActionRuntime.Integration;

namespace QuickerRpc.Console.ActionRuntime;

internal static class ActionRuntimeCli
{
    internal static int Run(
        ActionRuntimePackageBuilder.BuildResult buildResult,
        bool json,
        bool debug,
        bool verboseHost,
        bool checkOnly)
    {
        if (!buildResult.Success || buildResult.Package is null)
        {
            return EmitError(json, buildResult.ErrorCode ?? "RUNTIME_PACKAGE_BUILD_FAILED", buildResult.ErrorMessage ?? "Build failed.");
        }

        var executor = new ActionRuntimeExecutor(
            defaultHostServices: verboseHost ? new ConsoleHostServices() : NoopHostServices.Instance);

        var package = buildResult.Package;
        var report = executor.AnalyzeSupport(package);

        if (checkOnly)
        {
            WriteCheckOutput(json, buildResult, package, report);
            return report.IsFullySupported ? ExitCodes.Success : ExitCodes.Error;
        }

        if (debug)
        {
            package.Options = new RuntimeExecutionOptions { IsDebugging = true };
        }

        var result = executor.Execute(package);
        WriteRunOutput(json, buildResult, package, result, report);
        return result.IsSuccess ? ExitCodes.Success : ExitCodes.Error;
    }

    internal static int Keys(bool json)
    {
        var keys = ActionRuntimeBootstrap.GetSupportedStepKeys()
            .OrderBy(static key => key, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new
                {
                    ok = true,
                    action = "runtime-keys",
                    standalone = true,
                    count = keys.Count,
                    keys,
                },
                QkrpcJson.CliOutput));
        }
        else
        {
            foreach (var key in keys)
            {
                global::System.Console.WriteLine(key);
            }
        }

        return ExitCodes.Success;
    }

    private static void WriteCheckOutput(
        bool json,
        ActionRuntimePackageBuilder.BuildResult buildResult,
        ActionExecutionPackage package,
        PackageSupportReport report)
    {
        var payload = new
        {
            ok = report.IsFullySupported,
            action = "runtime-check",
            standalone = true,
            actionId = package.ActionId,
            actionTitle = package.ActionTitle,
            projectDirectory = buildResult.ProjectDirectory,
            isFullySupported = report.IsFullySupported,
            totalStepCount = report.TotalStepCount,
            supportedStepKeys = report.SupportedStepKeys,
            unsupportedStepKeys = report.UnsupportedStepKeys,
            sourceProgramJson = buildResult.SourceProgramJson,
            compiledProgramJson = buildResult.CompiledProgramJson,
            generatedProgramCs = buildResult.GeneratedProgramCs,
            compiledFiles = buildResult.CompiledFiles,
        };

        global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
    }

    private static void WriteRunOutput(
        bool json,
        ActionRuntimePackageBuilder.BuildResult buildResult,
        ActionExecutionPackage package,
        RuntimeExecutionResult result,
        PackageSupportReport report)
    {
        var payload = new
        {
            ok = result.IsSuccess,
            action = "runtime-run",
            standalone = true,
            actionId = package.ActionId,
            actionTitle = package.ActionTitle,
            projectDirectory = buildResult.ProjectDirectory,
            executionId = result.ExecutionId,
            returnResult = result.ReturnResult,
            outputVars = result.OutputVars,
            errorMessage = result.ErrorMessage,
            stopFlag = result.StopFlag.ToString(),
            unsupportedStepKeys = report.UnsupportedStepKeys,
            sourceProgramJson = buildResult.SourceProgramJson,
            compiledProgramJson = buildResult.CompiledProgramJson,
            generatedProgramCs = buildResult.GeneratedProgramCs,
            compiledFiles = buildResult.CompiledFiles,
            logs = result.Logs.Select(log => new
            {
                level = log.Level.ToString(),
                message = log.Message,
                timestamp = log.Timestamp,
            }).ToList(),
        };

        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
            return;
        }

        if (result.IsSuccess)
        {
            if (!string.IsNullOrWhiteSpace(result.ReturnResult))
            {
                global::System.Console.WriteLine(result.ReturnResult);
            }
            else
            {
                global::System.Console.WriteLine("Action completed.");
            }
        }
        else
        {
            global::System.Console.Error.WriteLine(result.ErrorMessage ?? "Action failed.");
        }
    }

    private static int EmitError(bool json, string code, string message)
    {
        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new { ok = false, action = "runtime-run", standalone = true, error = code, message },
                QkrpcJson.CliOutput));
        }
        else
        {
            global::System.Console.Error.WriteLine(message);
        }

        return ExitCodes.Error;
    }
}
