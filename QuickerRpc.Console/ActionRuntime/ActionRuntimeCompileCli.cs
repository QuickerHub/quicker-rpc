using System.Text;
using System.Text.Json;
using Quicker.ActionRuntime.ScriptCompiler;

namespace QuickerRpc.Console.ActionRuntime;

internal static class ActionRuntimeCompileCli
{
    internal static int Compile(
        ActionRuntimePackageBuilder.BuildResult buildResult,
        bool json,
        string? csharpOut,
        string? scriptOut)
    {
        if (!buildResult.Success || buildResult.Package?.Program is null)
        {
            return EmitError(
                json,
                buildResult.ErrorCode ?? "RUNTIME_PACKAGE_BUILD_FAILED",
                buildResult.ErrorMessage ?? "Build failed.");
        }

        var package = buildResult.Package;
        var compileResult = new ActionToScriptCompiler().Compile(package.Program);

        if (!string.IsNullOrWhiteSpace(csharpOut))
        {
            WriteUtf8File(csharpOut, compileResult.CSharpScript ?? string.Empty);
        }

        if (!string.IsNullOrWhiteSpace(scriptOut))
        {
            WriteUtf8File(scriptOut, compileResult.Script);
        }

        var ok = !string.IsNullOrWhiteSpace(compileResult.CSharpScript);
        WriteOutput(json, buildResult, package, compileResult, ok);

        return ok ? ExitCodes.Success : ExitCodes.Error;
    }

    private static void WriteOutput(
        bool json,
        ActionRuntimePackageBuilder.BuildResult buildResult,
        Quicker.ActionRuntime.Abstractions.ActionExecutionPackage package,
        ScriptCompileResult compileResult,
        bool ok)
    {
        if (json)
        {
            var payload = new
            {
                ok,
                action = "runtime-compile",
                standalone = true,
                actionId = package.ActionId,
                actionTitle = package.ActionTitle,
                projectDirectory = buildResult.ProjectDirectory,
                hasCSharpScript = !string.IsNullOrWhiteSpace(compileResult.CSharpScript),
                hasUnsupportedSteps = compileResult.UnsupportedSteps.Count > 0,
                unsupportedSteps = compileResult.UnsupportedSteps.Select(step => new
                {
                    stepIndex = step.StepIndex,
                    stepRunnerKey = step.StepRunnerKey,
                    note = step.Note,
                }).ToList(),
                warnings = compileResult.Warnings,
                script = compileResult.Script,
                csharpScript = compileResult.CSharpScript,
                sourceProgramJson = buildResult.SourceProgramJson,
                compiledProgramJson = buildResult.CompiledProgramJson,
                generatedProgramCs = buildResult.GeneratedProgramCs,
                compiledFiles = buildResult.CompiledFiles,
            };

            global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
            return;
        }

        if (!string.IsNullOrWhiteSpace(compileResult.CSharpScript))
        {
            global::System.Console.Write(compileResult.CSharpScript);
            return;
        }

        if (compileResult.UnsupportedSteps.Count > 0)
        {
            var keys = string.Join(
                ", ",
                compileResult.UnsupportedSteps.Select(step => step.StepRunnerKey).Distinct(StringComparer.OrdinalIgnoreCase));
            global::System.Console.Error.WriteLine(
                $"Script compile produced no C# (unsupported steps: {keys}). Use --json for details.");
            return;
        }

        global::System.Console.Error.WriteLine("Script compile produced no C# output. Use --json for details.");
    }

    private static void WriteUtf8File(string path, string content)
    {
        var fullPath = Path.GetFullPath(path.Trim());
        var directory = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllText(fullPath, content, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
    }

    private static int EmitError(bool json, string code, string message)
    {
        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new { ok = false, action = "runtime-compile", standalone = true, error = code, message },
                QkrpcJson.CliOutput));
        }
        else
        {
            global::System.Console.Error.WriteLine(message);
        }

        return ExitCodes.Error;
    }
}
