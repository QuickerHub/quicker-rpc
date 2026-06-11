using System.Text.Json;
using Quicker.ActionRuntime.Abstractions;
using Quicker.ActionRuntime.Integration;
using Quicker.ActionRuntime.ScriptCompiler;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.Console.ActionRuntime;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

internal static class ActionRuntimeServeOps
{
    internal static async Task<ServeInvokeResponse> RunAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var buildResult = await BuildPackageAsync(rpc, args, token).ConfigureAwait(false);
        if (buildResult.Error is not null)
        {
            return buildResult.Error;
        }

        if (!buildResult.Result!.Success || buildResult.Result.Package is null)
        {
            return Fail(
                buildResult.Result.ErrorCode ?? "RUNTIME_PACKAGE_BUILD_FAILED",
                buildResult.Result.ErrorMessage ?? "Build failed.");
        }

        var verboseHost = ServeJsonArgs.GetBool(args, "verboseHost")
            || ServeJsonArgs.GetBool(args, "verbose-host");
        var debug = ServeJsonArgs.GetBool(args, "debug");
        var executor = new ActionRuntimeExecutor(
            defaultHostServices: verboseHost ? new ConsoleHostServices() : NoopHostServices.Instance);

        var package = buildResult.Result.Package;
        var report = executor.AnalyzeSupport(package);
        if (debug)
        {
            package.Options = new RuntimeExecutionOptions { IsDebugging = true };
        }

        var result = executor.Execute(package);
        return Ok(new
        {
            ok = result.IsSuccess,
            action = "runtime-run",
            standalone = true,
            actionId = package.ActionId,
            actionTitle = package.ActionTitle,
            projectDirectory = buildResult.Result.ProjectDirectory,
            executionId = result.ExecutionId,
            returnResult = result.ReturnResult,
            outputVars = result.OutputVars,
            errorMessage = result.ErrorMessage,
            stopFlag = result.StopFlag.ToString(),
            unsupportedStepKeys = report.UnsupportedStepKeys,
            sourceProgramJson = buildResult.Result.SourceProgramJson,
            compiledProgramJson = buildResult.Result.CompiledProgramJson,
            generatedProgramCs = buildResult.Result.GeneratedProgramCs,
            compiledFiles = SerializeCompiledFiles(buildResult.Result.CompiledFiles),
            logs = result.Logs.Select(log => new
            {
                level = log.Level.ToString(),
                message = log.Message,
                timestamp = log.Timestamp,
            }),
        });
    }

    internal static async Task<ServeInvokeResponse> CheckAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var buildResult = await BuildPackageAsync(rpc, args, token).ConfigureAwait(false);
        if (buildResult.Error is not null)
        {
            return buildResult.Error;
        }

        if (!buildResult.Result!.Success || buildResult.Result.Package is null)
        {
            return Fail(
                buildResult.Result.ErrorCode ?? "RUNTIME_PACKAGE_BUILD_FAILED",
                buildResult.Result.ErrorMessage ?? "Build failed.");
        }

        var executor = new ActionRuntimeExecutor();
        var report = executor.AnalyzeSupport(buildResult.Result.Package);
        return Ok(new
        {
            ok = report.IsFullySupported,
            action = "runtime-check",
            standalone = true,
            actionId = buildResult.Result.Package.ActionId,
            actionTitle = buildResult.Result.Package.ActionTitle,
            projectDirectory = buildResult.Result.ProjectDirectory,
            isFullySupported = report.IsFullySupported,
            totalStepCount = report.TotalStepCount,
            supportedStepKeys = report.SupportedStepKeys,
            unsupportedStepKeys = report.UnsupportedStepKeys,
            sourceProgramJson = buildResult.Result.SourceProgramJson,
            compiledProgramJson = buildResult.Result.CompiledProgramJson,
            generatedProgramCs = buildResult.Result.GeneratedProgramCs,
            compiledFiles = SerializeCompiledFiles(buildResult.Result.CompiledFiles),
        });
    }

    internal static async Task<ServeInvokeResponse> CompileAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var buildResult = await BuildPackageAsync(rpc, args, token).ConfigureAwait(false);
        if (buildResult.Error is not null)
        {
            return buildResult.Error;
        }

        if (!buildResult.Result!.Success || buildResult.Result.Package?.Program is null)
        {
            return Fail(
                buildResult.Result.ErrorCode ?? "RUNTIME_PACKAGE_BUILD_FAILED",
                buildResult.Result.ErrorMessage ?? "Build failed.");
        }

        var compileResult = new ActionToScriptCompiler().Compile(buildResult.Result.Package.Program);
        var ok = !string.IsNullOrWhiteSpace(compileResult.CSharpScript);
        return Ok(new
        {
            ok,
            action = "runtime-compile",
            standalone = true,
            actionId = buildResult.Result.Package.ActionId,
            actionTitle = buildResult.Result.Package.ActionTitle,
            projectDirectory = buildResult.Result.ProjectDirectory,
            hasCSharpScript = ok,
            hasUnsupportedSteps = compileResult.UnsupportedSteps.Count > 0,
            unsupportedSteps = compileResult.UnsupportedSteps.Select(step => new
            {
                stepIndex = step.StepIndex,
                stepRunnerKey = step.StepRunnerKey,
                note = step.Note,
            }),
            warnings = compileResult.Warnings,
            script = compileResult.Script,
            csharpScript = compileResult.CSharpScript,
            sourceProgramJson = buildResult.Result.SourceProgramJson,
            compiledProgramJson = buildResult.Result.CompiledProgramJson,
            generatedProgramCs = buildResult.Result.GeneratedProgramCs,
            compiledFiles = SerializeCompiledFiles(buildResult.Result.CompiledFiles),
        });
    }

    internal static ServeInvokeResponse Keys()
    {
        var keys = ActionRuntimeBootstrap.GetSupportedStepKeys()
            .OrderBy(static key => key, StringComparer.OrdinalIgnoreCase)
            .ToList();
        return Ok(new
        {
            ok = true,
            action = "runtime-keys",
            standalone = true,
            count = keys.Count,
            keys,
        });
    }

    private sealed class BuildPackageOutcome
    {
        public ActionRuntimePackageBuilder.BuildResult? Result { get; init; }

        public ServeInvokeResponse? Error { get; init; }
    }

    private static async Task<BuildPackageOutcome> BuildPackageAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        string? projectDir = null;
        var explicitDir = ServeJsonArgs.GetString(args, "dir", "projectDir", "projectDirectory");
        if (!string.IsNullOrWhiteSpace(explicitDir))
        {
            var workspaceRoot = ServeJsonArgs.GetString(args, "workspaceRoot", "workspace", "cwd");
            try
            {
                var path = explicitDir.Trim();
                if (!Path.IsPathRooted(path) && !string.IsNullOrWhiteSpace(workspaceRoot))
                {
                    path = Path.Combine(workspaceRoot.Trim(), path);
                }

                projectDir = QuickerProjectLayout.ResolveProjectDirectory(path);
            }
            catch (Exception ex)
            {
                return new BuildPackageOutcome { Error = Fail("INVALID_DIR", ex.Message) };
            }
        }

        var actionId = ServeJsonArgs.GetString(args, "id", "actionId");
        var packageFile = ServeJsonArgs.GetString(args, "packageFile", "package-file");
        var xaction = ServeJsonArgs.GetJsonInlineText(args, "xaction", "program");
        var xactionFile = ServeJsonArgs.GetString(args, "xactionFile", "xaction-file");
        var inputParam = ServeJsonArgs.GetString(args, "param", "input");

        var buildResult = ActionRuntimePackageBuilder.Build(
            packageFile,
            projectDir,
            actionId,
            xaction,
            xactionFile,
            inputParam);

        if (ShouldFetchActionFromQuicker(projectDir, actionId, packageFile, xaction, xactionFile, buildResult))
        {
            buildResult = await ActionRuntimeQuickerLoader.BuildFromActionIdAsync(
                    rpc,
                    actionId!,
                    inputParam,
                    token)
                .ConfigureAwait(false);
        }

        return new BuildPackageOutcome { Result = buildResult };
    }

    private static bool ShouldFetchActionFromQuicker(
        string? projectDir,
        string? actionId,
        string? packageFile,
        string? xaction,
        string? xactionFile,
        ActionRuntimePackageBuilder.BuildResult buildResult) =>
        buildResult.ErrorCode == "PROJECT_NOT_FOUND"
        && string.IsNullOrWhiteSpace(projectDir)
        && !string.IsNullOrWhiteSpace(actionId)
        && string.IsNullOrWhiteSpace(packageFile)
        && string.IsNullOrWhiteSpace(xaction)
        && string.IsNullOrWhiteSpace(xactionFile);

    private static IEnumerable<object> SerializeCompiledFiles(
        IReadOnlyList<ActionRuntimeCompiledFile> files) =>
        files.Select(file => new
        {
            stepRunnerKey = file.StepRunnerKey,
            paramKey = file.ParamKey,
            sourceFile = file.SourceFile,
            language = file.Language,
            content = file.Content,
        });

    private static ServeInvokeResponse Ok(object data) =>
        new() { Ok = true, Data = data };

    private static ServeInvokeResponse Fail(string code, string message) =>
        new() { Ok = false, Error = code, Message = message };
}
