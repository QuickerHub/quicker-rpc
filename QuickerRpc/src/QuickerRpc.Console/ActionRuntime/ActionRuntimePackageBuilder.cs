using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.ActionRuntime.Abstractions;
using Quicker.ActionRuntime.Abstractions.Models;
using Quicker.ActionRuntime.Integration;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.Console.ActionRuntime;

internal static class ActionRuntimePackageBuilder
{
    internal sealed class BuildResult
    {
        public bool Success { get; init; }

        public string? ErrorCode { get; init; }

        public string? ErrorMessage { get; init; }

        public ActionExecutionPackage? Package { get; init; }

        public string? ProjectDirectory { get; init; }

        public string? SourceProgramJson { get; init; }

        public string? CompiledProgramJson { get; init; }

        public IReadOnlyList<ActionRuntimeCompiledFile> CompiledFiles { get; init; } =
            Array.Empty<ActionRuntimeCompiledFile>();

        public string? GeneratedProgramCs { get; init; }

        public static BuildResult Ok(
            ActionExecutionPackage package,
            string? projectDirectory = null,
            string? sourceProgramJson = null,
            string? compiledProgramJson = null,
            IReadOnlyList<ActionRuntimeCompiledFile>? compiledFiles = null) =>
            new()
            {
                Success = true,
                Package = package,
                ProjectDirectory = projectDirectory,
                SourceProgramJson = sourceProgramJson,
                CompiledProgramJson = compiledProgramJson,
                CompiledFiles = compiledFiles ?? Array.Empty<ActionRuntimeCompiledFile>(),
                GeneratedProgramCs = package.Program is null
                    ? null
                    : ActionRuntimeProgramCsEmitter.Emit(package.Program, package.ActionTitle),
            };

        public static BuildResult Fail(string code, string message) =>
            new() { Success = false, ErrorCode = code, ErrorMessage = message };
    }

    internal static BuildResult Build(
        string? packageFile,
        string? projectDir,
        string? actionId,
        string? xactionInline,
        string? xactionFile,
        string? inputParam,
        string? compressedFile = null)
    {
        var hasPackageFile = !string.IsNullOrWhiteSpace(packageFile);
        var hasProjectDir = !string.IsNullOrWhiteSpace(projectDir);
        var hasActionId = !string.IsNullOrWhiteSpace(actionId);
        var hasXAction = !string.IsNullOrWhiteSpace(xactionInline) || !string.IsNullOrWhiteSpace(xactionFile);
        var hasCompressedFile = !string.IsNullOrWhiteSpace(compressedFile);

        var sourceCount = (hasPackageFile ? 1 : 0)
                          + (hasProjectDir ? 1 : 0)
                          + (hasActionId ? 1 : 0)
                          + (hasXAction ? 1 : 0)
                          + (hasCompressedFile ? 1 : 0);
        if (sourceCount == 0)
        {
            return BuildResult.Fail(
                "MISSING_RUNTIME_SOURCE",
                "Provide --package-file, --dir, --id, --compressed-file, or --xaction/--xaction-file.");
        }

        if (sourceCount > 1)
        {
            return BuildResult.Fail(
                "CONFLICTING_RUNTIME_SOURCE",
                "Use only one of --package-file, --dir, --id, --compressed-file, or --xaction/--xaction-file.");
        }

        try
        {
            if (hasCompressedFile)
            {
                var compressedPath = compressedFile!.Trim();
                var compressedJson = File.ReadAllText(compressedPath, System.Text.Encoding.UTF8);
                var programId = (actionId ?? string.Empty).Trim();
                if (programId.Length == 0)
                {
                    programId = "shared";
                }

                return BuildFromQuickerCompressed(programId, actionTitle: null, compressedJson, inputParam);
            }

            if (hasPackageFile)
            {
                var packagePath = packageFile!.Trim();
                var package = ActionExecutionPackageLoader.LoadFromFile(packagePath);
                ApplyInputParam(package, inputParam);
                var sourceJson = File.ReadAllText(packagePath, System.Text.Encoding.UTF8);
                var compiledJson = package.Program is null
                    ? sourceJson
                    : ActionRuntimeCompileArtifacts.FormatJson(
                        ActionRuntimeCompileArtifacts.ProgramToJObject(package.Program));
                var displayJson = ActionRuntimeCompileArtifacts.FormatMinimalWireProgramJson(
                    JToken.Parse(sourceJson),
                    omitSubProgramBodies: true);
                return BuildResult.Ok(package, sourceProgramJson: displayJson, compiledProgramJson: compiledJson);
            }

            if (hasXAction)
            {
                var (jsonOk, jsonText, jsonErrorCode, jsonErrorMessage) =
                    QkrpcJsonPayload.Resolve(xactionInline, xactionFile, "xaction");
                if (!jsonOk)
                {
                    return BuildResult.Fail(jsonErrorCode!, jsonErrorMessage!);
                }

                if (!TryParseProgramBody(jsonText!, out var program, out var parseError))
                {
                    return BuildResult.Fail("INVALID_XACTION_JSON", parseError!);
                }

                var package = new ActionExecutionPackage { Program = program };
                ApplyInputParam(package, inputParam);
                ActionExecutionPackageLoader.EnsureExecutionId(package);
                var parsed = JToken.Parse(jsonText!);
                var sourceJson = ActionRuntimeCompileArtifacts.FormatMinimalWireProgramJson(
                    parsed,
                    omitSubProgramBodies: true);
                var compiledJson = ActionRuntimeCompileArtifacts.FormatJson(
                    ActionRuntimeCompileArtifacts.ProgramToJObject(program));
                return BuildResult.Ok(
                    package,
                    sourceProgramJson: sourceJson,
                    compiledProgramJson: compiledJson);
            }

            string resolvedDir;
            if (hasProjectDir)
            {
                resolvedDir = QuickerProjectLayout.ResolveProjectDirectory(projectDir!);
            }
            else
            {
                try
                {
                    resolvedDir = ActionProjectCatalog.ResolveImportProjectDirectory(actionId!, explicitDir: null);
                }
                catch (Exception ex)
                {
                    return BuildResult.Fail("PROJECT_NOT_FOUND", ex.Message);
                }
            }

            return BuildFromProjectDirectory(resolvedDir, inputParam);
        }
        catch (Exception ex)
        {
            return BuildResult.Fail("RUNTIME_PACKAGE_BUILD_FAILED", ex.Message);
        }
    }

    internal static BuildResult BuildFromQuickerCompressed(
        string actionId,
        string? actionTitle,
        string compressedJson,
        string? inputParam)
    {
        try
        {
            var root = JObject.Parse(compressedJson);
            var body = new JObject
            {
                ["steps"] = root["steps"] ?? new JArray(),
                ["variables"] = root["variables"] ?? new JArray(),
            };
            if (root["subPrograms"] is JArray subPrograms && subPrograms.Count > 0)
            {
                body["subPrograms"] = subPrograms;
            }

            NormalizeProgramBodyForParse(body);
            var bodyJson = JTokenCompat.Compact(body);
            if (!TryParseProgramBody(bodyJson, out var program, out var parseError))
            {
                return BuildResult.Fail("INVALID_PROGRAM_JSON", parseError!);
            }

            var package = new ActionExecutionPackage
            {
                ActionId = actionId,
                ActionTitle = actionTitle ?? root.Value<string>("title"),
                Program = program,
            };
            ApplyInputParam(package, inputParam);
            ActionExecutionPackageLoader.EnsureExecutionId(package);
            var sourceProgramJson = ActionRuntimeCompileArtifacts.FormatMinimalWireProgramJson(
                body,
                omitSubProgramBodies: true);
            var compiledProgramJson = ActionRuntimeCompileArtifacts.FormatMinimalWireProgramJson(body);
            return BuildResult.Ok(
                package,
                sourceProgramJson: sourceProgramJson,
                compiledProgramJson: compiledProgramJson);
        }
        catch (Exception ex)
        {
            return BuildResult.Fail("RUNTIME_PACKAGE_BUILD_FAILED", ex.Message);
        }
    }

    private static BuildResult BuildFromProjectDirectory(string projectDir, string? inputParam)
    {
        var infoPath = QuickerProjectLayout.GetInfoPath(projectDir);
        if (!File.Exists(infoPath))
        {
            return BuildResult.Fail("INFO_NOT_FOUND", $"info.json not found under {projectDir}.");
        }

        ActionProjectFormDefNormalizer.TryApplyToProject(projectDir);
        var data = QuickerProjectFiles.ReadData(projectDir);
        var compileResult = XActionFileRefCompiler.Compile(data, projectDir);
        if (!compileResult.Success || compileResult.CompiledData is null)
        {
            return BuildResult.Fail(
                "COMPILE_FAILED",
                compileResult.ErrorMessage ?? "file compile failed.");
        }

        if (!TryParseProgramBody(JTokenCompat.Compact(compileResult.CompiledData), out var program, out var parseError))
        {
            return BuildResult.Fail("INVALID_PROGRAM_JSON", parseError!);
        }

        string? actionId = null;
        string? actionTitle = null;
        try
        {
            var info = QuickerProjectFiles.ReadActionInfo(projectDir);
            actionId = ActionProjectIdentity.FromInfoOrDirectory(info, projectDir);
            actionTitle = info.Title;
        }
        catch
        {
            // info.json optional metadata for runtime execution
        }

        var package = new ActionExecutionPackage
        {
            ActionId = actionId,
            ActionTitle = actionTitle,
            Program = program,
        };
        ApplyInputParam(package, inputParam);
        ActionExecutionPackageLoader.EnsureExecutionId(package);
        var sourceProgramJson = ActionRuntimeCompileArtifacts.FormatMinimalWireProgramJson(
            data,
            omitSubProgramBodies: true);
        var compiledProgramJson = ActionRuntimeCompileArtifacts.FormatJson(compileResult.CompiledData);
        var compiledFiles = ActionRuntimeCompileArtifacts.CollectInlinedFiles(data, compileResult.CompiledData);
        return BuildResult.Ok(
            package,
            projectDir,
            sourceProgramJson,
            compiledProgramJson,
            compiledFiles);
    }

    private static void ApplyInputParam(ActionExecutionPackage package, string? inputParam)
    {
        if (!string.IsNullOrWhiteSpace(inputParam))
        {
            package.InputParam = inputParam;
        }
    }

    private static bool TryParseProgramBody(string json, out XAction program, out string? error)
    {
        program = null!;
        error = null;
        try
        {
            var token = JToken.Parse(json);
            if (token is not JObject root)
            {
                error = "Program JSON must be an object.";
                return false;
            }

            if (root["program"] is JObject wrapped)
            {
                root = wrapped;
            }

            if (root["steps"] is null && root["Steps"] is JArray nativeSteps)
            {
                root = new JObject
                {
                    ["steps"] = nativeSteps,
                    ["variables"] = root["Variables"] ?? new JArray(),
                    ["subPrograms"] = root["SubPrograms"],
                };
            }

            NormalizeProgramBodyForParse(root);
            program = ParseProgramRoot(root);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static XAction ParseProgramRoot(JObject root) =>
        new()
        {
            LimitSingleInstance = root.Value<bool?>("limitSingleInstance") ?? true,
            SummaryExpression = root.Value<string>("summaryExpression") ?? "$$",
            Variables = ParseVariables(root["variables"] as JArray ?? root["Variables"] as JArray),
            SubPrograms = ParseSubPrograms(root["subPrograms"] as JArray ?? root["SubPrograms"] as JArray),
            Steps = ParseSteps(root["steps"] as JArray ?? root["Steps"] as JArray),
        };

    private static IList<ActionVariable> ParseVariables(JArray? variables)
    {
        if (variables is null || variables.Count == 0)
        {
            return [];
        }

        return variables
            .OfType<JObject>()
            .Select(obj => new ActionVariable
            {
                Key = obj.Value<string>("key") ?? obj.Value<string>("Key") ?? string.Empty,
                DefaultValue = obj["defaultValue"]?.ToString() ?? obj["DefaultValue"]?.ToString(),
                IsOutput = obj.Value<bool?>("isOutput") ?? obj.Value<bool?>("IsOutput") ?? false,
            })
            .ToList();
    }

    private static IList<SubProgram>? ParseSubPrograms(JArray? subPrograms)
    {
        if (subPrograms is null || subPrograms.Count == 0)
        {
            return null;
        }

        return subPrograms
            .OfType<JObject>()
            .Select(obj => new SubProgram
            {
                Id = obj.Value<string>("id") ?? obj.Value<string>("Id"),
                Name = obj.Value<string>("name") ?? obj.Value<string>("Name"),
                SummaryExpression = obj.Value<string>("summaryExpression")
                                    ?? obj.Value<string>("SummaryExpression")
                                    ?? "$$",
                Variables = ParseVariables(obj["variables"] as JArray ?? obj["Variables"] as JArray),
                Steps = ParseSteps(obj["steps"] as JArray ?? obj["Steps"] as JArray),
                SubPrograms = ParseSubPrograms(obj["subPrograms"] as JArray ?? obj["SubPrograms"] as JArray),
            })
            .ToList();
    }

    private static IList<ActionStep> ParseSteps(JArray? steps)
    {
        if (steps is null || steps.Count == 0)
        {
            return [];
        }

        return steps.OfType<JObject>().Select(ParseStep).ToList();
    }

    private static ActionStep ParseStep(JObject step) =>
        new()
        {
            StepRunnerKey = step.Value<string>("stepRunnerKey") ?? step.Value<string>("StepRunnerKey") ?? string.Empty,
            Disabled = step.Value<bool?>("disabled") ?? step.Value<bool?>("Disabled") ?? false,
            DelayMs = step.Value<int?>("delayMs") ?? step.Value<int?>("DelayMs") ?? 0,
            Note = step.Value<string>("note") ?? step.Value<string>("Note"),
            InputParams = ParseInputParams(step["inputParams"] as JObject ?? step["InputParams"] as JObject),
            OutputParams = ParseOutputParams(step["outputParams"] as JObject ?? step["OutputParams"] as JObject),
            IfSteps = ParseSteps(step["ifSteps"] as JArray ?? step["IfSteps"] as JArray),
            ElseSteps = ParseSteps(step["elseSteps"] as JArray ?? step["ElseSteps"] as JArray),
        };

    private static Dictionary<string, ActionStepParam> ParseInputParams(JObject? inputParams)
    {
        var result = new Dictionary<string, ActionStepParam>(StringComparer.OrdinalIgnoreCase);
        if (inputParams is null)
        {
            return result;
        }

        foreach (var prop in inputParams.Properties())
        {
            result[prop.Name] = ParseInputParam(prop.Value);
        }

        return result;
    }

    private static ActionStepParam ParseInputParam(JToken token)
    {
        if (token is JObject obj)
        {
            return new ActionStepParam
            {
                Value = ReadTokenString(obj["value"] ?? obj["Value"]),
                VarKey = ReadTokenString(obj["varKey"] ?? obj["VarKey"] ?? obj["var"] ?? obj["Var"]),
            };
        }

        return new ActionStepParam { Value = token.Type == JTokenType.Null ? null : token.ToString() };
    }

    private static Dictionary<string, string> ParseOutputParams(JObject? outputParams)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (outputParams is null)
        {
            return result;
        }

        foreach (var prop in outputParams.Properties())
        {
            result[prop.Name] = prop.Value?.ToString() ?? string.Empty;
        }

        return result;
    }

    private static string? ReadTokenString(JToken? token) =>
        token is null || token.Type == JTokenType.Null ? null : token.ToString();

    private static void NormalizeProgramBodyForParse(JObject body)
    {
        NormalizeStepsArray(body["steps"] as JArray ?? body["Steps"] as JArray);
        var subPrograms = body["subPrograms"] as JArray ?? body["SubPrograms"] as JArray;
        if (subPrograms is null)
        {
            return;
        }

        foreach (var token in subPrograms.OfType<JObject>())
        {
            NormalizeStepsArray(token["steps"] as JArray ?? token["Steps"] as JArray);
        }
    }

    private static void NormalizeStepsArray(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        InputParamWireCoercer.ExpandStepsRecursive(steps);
        foreach (var step in steps.OfType<JObject>())
        {
            CoerceScalarInputParams(step["inputParams"] as JObject ?? step["InputParams"] as JObject);
        }
    }

    private static void CoerceScalarInputParams(JObject? inputParams)
    {
        if (inputParams is null)
        {
            return;
        }

        foreach (var prop in inputParams.Properties().ToList())
        {
            if (prop.Value is JObject)
            {
                continue;
            }

            prop.Value = InputParamWireCoercer.CoerceToParamObject(prop.Value);
        }
    }
}
