using System.Collections.Generic;
using System.Text.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Proto.V1;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunActionExtractAsync(ActionOptions options) =>
        await RunActionProjectExportAsync(options, forExtract: true).ConfigureAwait(false);

    private static async Task<int> RunActionExportAsync(ActionOptions options) =>
        await RunActionProjectExportAsync(options, forExtract: false).ConfigureAwait(false);

    private static async Task<int> RunActionApplyAsync(ActionOptions options) =>
        await RunActionProjectImportAsync(options, forApply: true).ConfigureAwait(false);

    private static async Task<int> RunActionImportAsync(ActionOptions options) =>
        await RunActionProjectImportAsync(options, forApply: false).ConfigureAwait(false);

    private static async Task<int> RunActionValidateAsync(ActionOptions options) =>
        await RunActionProjectValidateAsync(options).ConfigureAwait(false);

    private static async Task<int> RunActionProjectExportAsync(ActionOptions options, bool forExtract)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ACTION_ID", "Provide --id <actionId>.")
                .ConfigureAwait(false);
        }

        if (!forExtract && string.IsNullOrWhiteSpace(options.Dir))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_DIR", "Provide --dir <projectDirectory>.")
                .ConfigureAwait(false);
        }

        var exportOptions = new XActionFileRefExportOptions
        {
            AutoExternalizeMinLines = forExtract && !options.NoAutoFiles
                ? (options.MinLines > 0
                    ? options.MinLines
                    : XActionFileRefExportOptions.DefaultAutoExternalizeMinLines)
                : 0,
        };

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);

            var fullResponse = await session.Proxy
                .GetCompressedActionByIdAsync(actionId, "full", rpcToken)
                .ConfigureAwait(false);
            if (!fullResponse.Success || string.IsNullOrWhiteSpace(fullResponse.CompressedJson))
            {
                return await EmitErrorAndFailAsync(
                        options.Json,
                        "EXPORT_GET_FAILED",
                        fullResponse.ErrorMessage ?? "action get (full) failed.")
                    .ConfigureAwait(false);
            }

            var metaResponse = await session.Proxy
                .GetCompressedActionByIdAsync(actionId, "metadata", rpcToken)
                .ConfigureAwait(false);

            var metaRoot = metaResponse.Success && !string.IsNullOrWhiteSpace(metaResponse.CompressedJson)
                ? JObject.Parse(metaResponse.CompressedJson)
                : null;
            var title = metaRoot?.Value<string>("title");

            string projectDir;
            try
            {
                projectDir = forExtract
                    ? ActionProjectCatalog.ResolveExtractProjectDirectory(
                        actionId,
                        title,
                        options.Dir)
                    : QuickerProjectLayout.ResolveProjectDirectory(options.Dir!);
            }
            catch (Exception ex)
            {
                return await EmitErrorAndFailAsync(options.Json, "INVALID_DIR", ex.Message).ConfigureAwait(false);
            }

            var latestData = ParseProgramBodyFromCompressed(fullResponse.CompressedJson);
            QuickerProjectFiles.TryReadDataIfExists(projectDir, out var templateData);
            var exportResult = XActionFileRefExporter.Export(
                latestData,
                projectDir,
                templateData,
                exportOptions);
            if (!exportResult.Success || exportResult.ExportedData is null)
            {
                return await EmitErrorAndFailAsync(
                        options.Json,
                        "EXPORT_FAILED",
                        exportResult.ErrorMessage ?? "export failed.")
                    .ConfigureAwait(false);
            }

            Directory.CreateDirectory(projectDir);
            QuickerProjectFiles.WriteData(projectDir, exportResult.ExportedData);

            var info = ActionProjectInfoMapper.FromMetadataGet(
                actionId,
                fullResponse.EditVersion,
                metaRoot);
            if (string.IsNullOrWhiteSpace(info.Id))
            {
                info.Id = actionId;
            }

            QuickerProjectFiles.WriteActionInfo(projectDir, info);

            var projectDirectoryRelative = ActionProjectCatalog.GetRelativeProjectDirectory(projectDir);

            WriteProjectSuccess(
                options.Json,
                forExtract ? "action-extract" : "action-export",
                new
                {
                    success = true,
                    projectDirectory = projectDirectoryRelative,
                    projectDirectoryAbsolute = projectDir,
                    actionId = ActionProjectIdentity.FromInfoOrDirectory(info, projectDir) ?? actionId,
                    editVersion = info.EditVersion,
                    autoExternalizeMinLines = exportOptions.AutoExternalizeMinLines,
                    writtenFiles = exportResult.WrittenFiles,
                    warnings = exportResult.Warnings,
                },
                exportResult.Warnings);

            return ExitCodes.Success;
        }
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(
                    options.Json,
                    forExtract ? "ACTION_EXTRACT_FAILED" : "ACTION_EXPORT_FAILED",
                    ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunActionProjectValidateAsync(ActionOptions options)
    {
        var explicitId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(options.Dir) && string.IsNullOrWhiteSpace(explicitId))
        {
            return await EmitErrorAndFailAsync(
                    options.Json,
                    "MISSING_DIR_OR_ID",
                    "Provide --dir <projectDirectory> or --id <actionId>.")
                .ConfigureAwait(false);
        }

        string projectDir;
        try
        {
            projectDir = ActionProjectCatalog.ResolveImportProjectDirectory(explicitId, options.Dir);
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "INVALID_DIR", ex.Message).ConfigureAwait(false);
        }

        try
        {
            if (!File.Exists(QuickerProjectLayout.GetInfoPath(projectDir)))
            {
                return await EmitErrorAndFailAsync(options.Json, "INFO_NOT_FOUND", $"info.json not found under {projectDir}.")
                    .ConfigureAwait(false);
            }

            var info = QuickerProjectFiles.ReadActionInfo(projectDir);
            var actionId = ActionProjectIdentity.FromInfoOrDirectory(info, projectDir);
            if (string.IsNullOrWhiteSpace(actionId))
            {
                return await EmitErrorAndFailAsync(
                        options.Json,
                        "MISSING_ACTION_ID",
                        "Cannot resolve action id: use a GUID project folder name, info.json id, or pass --id.")
                    .ConfigureAwait(false);
            }

            if (explicitId.Length > 0
                && !string.Equals(explicitId, actionId, StringComparison.OrdinalIgnoreCase))
            {
                return await EmitErrorAndFailAsync(
                        options.Json,
                        "ACTION_ID_MISMATCH",
                        $"--id {explicitId} does not match project action id {actionId}.")
                    .ConfigureAwait(false);
            }

            var data = QuickerProjectFiles.ReadData(projectDir);
            var validateResult = XActionFileRefValidator.Validate(data, projectDir);
            if (!validateResult.Success)
            {
                if (options.Json)
                {
                    global::System.Console.WriteLine(JsonSerializer.Serialize(
                        new
                        {
                            ok = false,
                            action = "action-validate",
                            payload = new
                            {
                                success = false,
                                error = validateResult.ErrorMessage,
                                projectDirectory = ActionProjectCatalog.GetRelativeProjectDirectory(projectDir),
                                projectDirectoryAbsolute = projectDir,
                                actionId,
                                editVersion = info.EditVersion,
                                stepCount = validateResult.StepCount,
                                variableCount = validateResult.VariableCount,
                                fileRefs = validateResult.FileRefs,
                            },
                        },
                        QkrpcJson.CliOutput));
                }
                else
                {
                    global::System.Console.WriteLine(validateResult.ErrorMessage);
                }

                return ExitCodes.Error;
            }

            WriteProjectSuccess(
                options.Json,
                "action-validate",
                new
                {
                    success = true,
                    projectDirectory = ActionProjectCatalog.GetRelativeProjectDirectory(projectDir),
                    projectDirectoryAbsolute = projectDir,
                    actionId,
                    editVersion = info.EditVersion,
                    stepCount = validateResult.StepCount,
                    variableCount = validateResult.VariableCount,
                    fileRefs = validateResult.FileRefs,
                },
                warnings: null);

            return ExitCodes.Success;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "ACTION_VALIDATE_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunActionProjectImportAsync(ActionOptions options, bool forApply)
    {
        var explicitId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (forApply && string.IsNullOrWhiteSpace(options.Dir) && string.IsNullOrWhiteSpace(explicitId))
        {
            return await EmitErrorAndFailAsync(
                    options.Json,
                    "MISSING_DIR_OR_ID",
                    "Provide --dir <projectDirectory> or --id <actionId>.")
                .ConfigureAwait(false);
        }

        if (!forApply && string.IsNullOrWhiteSpace(options.Dir))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_DIR", "Provide --dir <projectDirectory>.")
                .ConfigureAwait(false);
        }

        string projectDir;
        try
        {
            projectDir = forApply
                ? ActionProjectCatalog.ResolveImportProjectDirectory(explicitId, options.Dir)
                : QuickerProjectLayout.ResolveProjectDirectory(options.Dir!);
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "INVALID_DIR", ex.Message).ConfigureAwait(false);
        }

        try
        {
            if (!File.Exists(QuickerProjectLayout.GetInfoPath(projectDir)))
            {
                return await EmitErrorAndFailAsync(options.Json, "INFO_NOT_FOUND", $"info.json not found under {projectDir}.")
                    .ConfigureAwait(false);
            }

            var info = QuickerProjectFiles.ReadActionInfo(projectDir);
            var actionId = ActionProjectIdentity.FromInfoOrDirectory(info, projectDir);
            if (string.IsNullOrWhiteSpace(actionId))
            {
                return await EmitErrorAndFailAsync(
                        options.Json,
                        "MISSING_ACTION_ID",
                        "Cannot resolve action id: use a GUID project folder name, info.json id, or pass --id.")
                    .ConfigureAwait(false);
            }

            if (explicitId.Length > 0
                && !string.Equals(explicitId, actionId, StringComparison.OrdinalIgnoreCase))
            {
                return await EmitErrorAndFailAsync(
                        options.Json,
                        "ACTION_ID_MISMATCH",
                        $"--id {explicitId} does not match project action id {actionId}.")
                    .ConfigureAwait(false);
            }

            var data = QuickerProjectFiles.ReadData(projectDir);
            var compileResult = XActionFileRefCompiler.Compile(data, projectDir);
            if (!compileResult.Success || compileResult.CompiledData is null)
            {
                return await EmitErrorAndFailAsync(
                        options.Json,
                        "COMPILE_FAILED",
                        compileResult.ErrorMessage ?? "file compile failed.")
                    .ConfigureAwait(false);
            }

            var expectedVersion = options.ExpectedEditVersion ?? info.EditVersion;

            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .ApplyXActionToActionAsync(
                    actionId,
                    compileResult.CompiledData.ToString(Newtonsoft.Json.Formatting.None),
                    expectedVersion,
                    options.Force,
                    rpcToken)
                .ConfigureAwait(false);

            if (!response.Success)
            {
                return await EmitErrorAndFailAsync(
                        options.Json,
                        "IMPORT_FAILED",
                        response.ErrorMessage ?? "action replace failed.")
                    .ConfigureAwait(false);
            }

            HeadlessCliResponses.WriteWarningsToStderr(response.Warnings);

            WriteProjectSuccess(
                options.Json,
                forApply ? "action-apply" : "action-import",
                new
                {
                    success = true,
                    projectDirectory = projectDir,
                    actionId = response.ActionId,
                    editVersion = response.EditVersion,
                    versionConflict = response.VersionConflict,
                    warnings = HeadlessCliResponses.ToWarningsArray(response.Warnings),
                },
                response.Warnings);

            return ExitCodes.Success;
        }
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(
                    options.Json,
                    forApply ? "ACTION_APPLY_FAILED" : "ACTION_IMPORT_FAILED",
                    ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunSubProgramExportAsync(SubProgramOptions options)
    {
        var id = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ID", "Provide --id <subProgramIdOrName>.")
                .ConfigureAwait(false);
        }

        if (string.IsNullOrWhiteSpace(options.Dir))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_DIR", "Provide --dir <projectDirectory>.")
                .ConfigureAwait(false);
        }

        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(options.Dir);
        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);

            var fullResponse = await session.Proxy
                .GetCompressedSubProgramAsync(id, "full", rpcToken)
                .ConfigureAwait(false);
            if (!fullResponse.Success || string.IsNullOrWhiteSpace(fullResponse.CompressedJson))
            {
                return await EmitErrorAndFailAsync(
                        options.Json,
                        "EXPORT_GET_FAILED",
                        fullResponse.ErrorMessage ?? "subprogram get (full) failed.")
                    .ConfigureAwait(false);
            }

            var metaResponse = await session.Proxy
                .GetCompressedSubProgramAsync(id, "metadata", rpcToken)
                .ConfigureAwait(false);

            var latestData = ParseProgramBodyFromCompressed(fullResponse.CompressedJson);
            QuickerProjectFiles.TryReadDataIfExists(projectDir, out var templateData);
            var exportResult = XActionFileRefExporter.Export(latestData, projectDir, templateData);
            if (!exportResult.Success || exportResult.ExportedData is null)
            {
                return await EmitErrorAndFailAsync(
                        options.Json,
                        "EXPORT_FAILED",
                        exportResult.ErrorMessage ?? "export failed.")
                    .ConfigureAwait(false);
            }

            Directory.CreateDirectory(projectDir);
            QuickerProjectFiles.WriteData(projectDir, exportResult.ExportedData);

            var metaRoot = metaResponse.Success && !string.IsNullOrWhiteSpace(metaResponse.CompressedJson)
                ? JObject.Parse(metaResponse.CompressedJson)
                : null;

            var info = new SubProgramProjectInfo
            {
                Id = fullResponse.SubProgramId,
                Name = fullResponse.Name,
                CallIdentifier = fullResponse.CallIdentifier,
                Description = metaRoot?.Value<string>("description"),
                Icon = metaRoot?.Value<string>("icon"),
                EditVersion = fullResponse.EditVersion,
                ExportedUtc = DateTime.UtcNow.ToString("o"),
            };
            QuickerProjectFiles.WriteSubProgramInfo(projectDir, info);

            WriteProjectSuccess(
                options.Json,
                "subprogram-export",
                new
                {
                    success = true,
                    projectDirectory = projectDir,
                    subProgramId = info.Id,
                    name = info.Name,
                    callIdentifier = info.CallIdentifier,
                    editVersion = info.EditVersion,
                    writtenFiles = exportResult.WrittenFiles,
                    warnings = exportResult.Warnings,
                },
                exportResult.Warnings);

            return ExitCodes.Success;
        }
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "SUBPROGRAM_EXPORT_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunSubProgramImportAsync(SubProgramOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.Dir))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_DIR", "Provide --dir <projectDirectory>.")
                .ConfigureAwait(false);
        }

        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(options.Dir);
        try
        {
            if (!File.Exists(QuickerProjectLayout.GetInfoPath(projectDir)))
            {
                return await EmitErrorAndFailAsync(options.Json, "INFO_NOT_FOUND", $"info.json not found under {projectDir}.")
                    .ConfigureAwait(false);
            }

            var info = QuickerProjectFiles.ReadSubProgramInfo(projectDir);
            var subProgramId = (info.Id ?? info.Name ?? string.Empty).Trim();
            if (subProgramId.Length == 0)
            {
                return await EmitErrorAndFailAsync(options.Json, "MISSING_ID", "info.json must contain id or name.")
                    .ConfigureAwait(false);
            }

            var data = QuickerProjectFiles.ReadData(projectDir);
            var compileResult = XActionFileRefCompiler.Compile(data, projectDir);
            if (!compileResult.Success || compileResult.CompiledData is null)
            {
                return await EmitErrorAndFailAsync(
                        options.Json,
                        "COMPILE_FAILED",
                        compileResult.ErrorMessage ?? "file compile failed.")
                    .ConfigureAwait(false);
            }

            var expectedVersion = options.ExpectedEditVersion ?? info.EditVersion;

            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .ApplyProgramToSubProgramAsync(
                    subProgramId,
                    compileResult.CompiledData.ToString(Newtonsoft.Json.Formatting.None),
                    expectedVersion,
                    options.Force,
                    rpcToken)
                .ConfigureAwait(false);

            if (!response.Success)
            {
                return await EmitErrorAndFailAsync(
                        options.Json,
                        "IMPORT_FAILED",
                        response.ErrorMessage ?? "subprogram replace failed.")
                    .ConfigureAwait(false);
            }

            HeadlessCliResponses.WriteWarningsToStderr(response.Warnings);

            WriteProjectSuccess(
                options.Json,
                "subprogram-import",
                new
                {
                    success = true,
                    subProgramId = response.SubProgramId,
                    callIdentifier = response.CallIdentifier,
                    editVersion = response.EditVersion,
                    versionConflict = response.VersionConflict,
                    warnings = HeadlessCliResponses.ToWarningsArray(response.Warnings),
                },
                response.Warnings);

            return ExitCodes.Success;
        }
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "SUBPROGRAM_IMPORT_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static JObject ParseProgramBodyFromCompressed(string compressedJson)
    {
        var root = JObject.Parse(compressedJson);
        var steps = root["steps"] as JArray ?? new JArray();
        var variables = root["variables"] as JArray ?? new JArray();
        return new JObject
        {
            ["steps"] = steps,
            ["variables"] = variables,
        };
    }

    private static void WriteProjectSuccess(bool json, string action, object payload, IEnumerable<string>? warnings)
    {
        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new { ok = true, action, payload },
                QkrpcJson.CliOutput));
        }
        else
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
        }

        HeadlessCliResponses.WriteWarningsToStderr(warnings);
    }
}