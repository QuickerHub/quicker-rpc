using System.Text.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

/// <summary>Local .quicker project ops for qkrpc serve (agent-gui workspace sync/save).</summary>
internal static class ActionProjectServeOps
{
    internal static async Task<ServeInvokeResponse> ExtractAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var actionId = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var explicitDir = ServeJsonArgs.GetString(args, "dir");
        var workspaceRoot = ResolveWorkspaceRoot(args);
        var minLines = ServeJsonArgs.GetInt(args, "minLines")
            ?? ServeJsonArgs.GetInt(args, "min-lines")
            ?? XActionFileRefExportOptions.DefaultAutoExternalizeMinLines;
        var noAutoFiles = ServeJsonArgs.GetBool(args, "noAutoFiles")
            || ServeJsonArgs.GetBool(args, "no-auto-files");
        var exportOptions = new XActionFileRefExportOptions
        {
            AutoExternalizeMinLines = noAutoFiles ? 0 : Math.Max(0, minLines),
        };

        try
        {
            var fullResponse = await rpc
                .GetCompressedActionByIdAsync(actionId.Trim(), "full", token)
                .ConfigureAwait(false);
            if (!fullResponse.Success || string.IsNullOrWhiteSpace(fullResponse.CompressedJson))
            {
                return Fail(
                    "EXPORT_GET_FAILED",
                    fullResponse.ErrorMessage ?? "action get (full) failed.");
            }

            var metaResponse = await rpc
                .GetCompressedActionByIdAsync(actionId.Trim(), "metadata", token)
                .ConfigureAwait(false);
            var metaRoot = metaResponse.Success && !string.IsNullOrWhiteSpace(metaResponse.CompressedJson)
                ? JObject.Parse(metaResponse.CompressedJson)
                : null;
            var title = metaRoot?.Value<string>("title");

            string projectDir;
            try
            {
                projectDir = ActionProjectCatalog.ResolveExtractProjectDirectory(
                    actionId.Trim(),
                    title,
                    explicitDir,
                    workspaceRoot);
            }
            catch (Exception ex)
            {
                return Fail("INVALID_DIR", ex.Message);
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
                return Fail("EXPORT_FAILED", exportResult.ErrorMessage ?? "export failed.");
            }

            var info = ActionProjectInfoMapper.FromMetadataGet(
                actionId.Trim(),
                fullResponse.EditVersion ?? 0L,
                metaRoot);
            if (string.IsNullOrWhiteSpace(info.Id))
            {
                info.Id = actionId.Trim();
            }

            var writtenFiles = ActionProjectExtractWriter.Write(
                projectDir,
                info,
                exportResult.ExportedData,
                exportResult.ResourceFiles);
            exportResult.WrittenFiles = writtenFiles;

            return Ok(new
            {
                ok = true,
                action = "action-extract",
                payload = new
                {
                    success = true,
                    projectDirectory = ActionProjectCatalog.GetRelativeProjectDirectory(
                        projectDir,
                        workspaceRoot),
                    projectDirectoryAbsolute = projectDir,
                    actionId = ActionProjectIdentity.FromInfoOrDirectory(info, projectDir) ?? actionId.Trim(),
                    editVersion = info.EditVersion,
                    autoExternalizeMinLines = exportOptions.AutoExternalizeMinLines,
                    writtenFiles,
                    warnings = exportResult.Warnings,
                },
            });
        }
        catch (Exception ex)
        {
            return Fail("ACTION_EXTRACT_FAILED", ex.Message);
        }
    }

    internal static ServeInvokeResponse Validate(JsonElement args)
    {
        var explicitId = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        var explicitDir = ServeJsonArgs.GetString(args, "dir");
        var workspaceRoot = ResolveWorkspaceRoot(args);
        if (string.IsNullOrWhiteSpace(explicitDir) && string.IsNullOrWhiteSpace(explicitId))
        {
            return Fail("MISSING_DIR_OR_ID", "args.dir or args.id is required.");
        }

        string projectDir;
        try
        {
            projectDir = ActionProjectCatalog.ResolveImportProjectDirectory(
                explicitId.Trim(),
                explicitDir,
                workspaceRoot);
        }
        catch (Exception ex)
        {
            return Fail("INVALID_DIR", ex.Message);
        }

        try
        {
            if (!File.Exists(QuickerProjectLayout.GetInfoPath(projectDir)))
            {
                return Fail("INFO_NOT_FOUND", $"info.json not found under {projectDir}.");
            }

            var info = QuickerProjectFiles.ReadActionInfo(projectDir);
            var actionId = ActionProjectIdentity.FromInfoOrDirectory(info, projectDir);
            if (string.IsNullOrWhiteSpace(actionId))
            {
                return Fail(
                    "MISSING_ACTION_ID",
                    "Cannot resolve action id: use a GUID project folder name, info.json id, or pass args.id.");
            }

            if (explicitId.Length > 0
                && !string.Equals(explicitId, actionId, StringComparison.OrdinalIgnoreCase))
            {
                return Fail(
                    "ACTION_ID_MISMATCH",
                    $"args.id {explicitId} does not match project action id {actionId}.");
            }

            ActionProjectFormDefNormalizer.TryApplyToProject(projectDir);
            var data = QuickerProjectFiles.ReadData(projectDir);
            var validateResult = XActionFileRefValidator.Validate(data, projectDir);
            var payload = new
            {
                success = validateResult.Success,
                error = validateResult.ErrorMessage,
                projectDirectory = ActionProjectCatalog.GetRelativeProjectDirectory(
                    projectDir,
                    workspaceRoot),
                projectDirectoryAbsolute = projectDir,
                actionId,
                editVersion = info.EditVersion,
                stepCount = validateResult.StepCount,
                variableCount = validateResult.VariableCount,
                fileRefs = validateResult.FileRefs,
            };

            return Ok(new
            {
                ok = validateResult.Success,
                action = "action-validate",
                payload,
            });
        }
        catch (Exception ex)
        {
            return Fail("ACTION_VALIDATE_FAILED", ex.Message);
        }
    }

    internal static async Task<ServeInvokeResponse> ApplyAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var explicitId = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        var explicitDir = ServeJsonArgs.GetString(args, "dir");
        var workspaceRoot = ResolveWorkspaceRoot(args);
        if (string.IsNullOrWhiteSpace(explicitDir) && string.IsNullOrWhiteSpace(explicitId))
        {
            return Fail("MISSING_DIR_OR_ID", "args.dir or args.id is required.");
        }

        string projectDir;
        try
        {
            projectDir = ActionProjectCatalog.ResolveImportProjectDirectory(
                explicitId.Trim(),
                explicitDir,
                workspaceRoot);
        }
        catch (Exception ex)
        {
            return Fail("INVALID_DIR", ex.Message);
        }

        try
        {
            if (!File.Exists(QuickerProjectLayout.GetInfoPath(projectDir)))
            {
                return Fail("INFO_NOT_FOUND", $"info.json not found under {projectDir}.");
            }

            var info = QuickerProjectFiles.ReadActionInfo(projectDir);
            var actionId = ActionProjectIdentity.FromInfoOrDirectory(info, projectDir);
            if (string.IsNullOrWhiteSpace(actionId))
            {
                return Fail(
                    "MISSING_ACTION_ID",
                    "Cannot resolve action id: use a GUID project folder name, info.json id, or pass args.id.");
            }

            if (explicitId.Length > 0
                && !string.Equals(explicitId, actionId, StringComparison.OrdinalIgnoreCase))
            {
                return Fail(
                    "ACTION_ID_MISMATCH",
                    $"args.id {explicitId} does not match project action id {actionId}.");
            }

            var data = QuickerProjectFiles.ReadData(projectDir);
            var compileResult = XActionFileRefCompiler.Compile(data, projectDir);
            if (!compileResult.Success || compileResult.CompiledData is null)
            {
                return Ok(new
                {
                    ok = false,
                    action = "action-apply",
                    payload = new
                    {
                        success = false,
                        error = compileResult.ErrorMessage ?? "file compile failed.",
                        projectDirectory = ActionProjectCatalog.GetRelativeProjectDirectory(
                            projectDir,
                            workspaceRoot),
                        projectDirectoryAbsolute = projectDir,
                        actionId,
                    },
                });
            }

            var expectedVersion = ServeJsonArgs.GetLong(args, "expectedEditVersion") ?? info.EditVersion;
            var force = ServeJsonArgs.GetBool(args, "force");
            var response = await rpc
                .ApplyXActionToActionAsync(
                    actionId,
                    compileResult.CompiledData.ToString(Newtonsoft.Json.Formatting.None),
                    expectedVersion,
                    force,
                    token)
                .ConfigureAwait(false);

            if (!response.Success)
            {
                return Ok(new
                {
                    ok = false,
                    action = "action-apply",
                    payload = new
                    {
                        success = false,
                        error = response.ErrorMessage ?? "action replace failed.",
                        projectDirectory = ActionProjectCatalog.GetRelativeProjectDirectory(
                            projectDir,
                            workspaceRoot),
                        projectDirectoryAbsolute = projectDir,
                        actionId,
                        versionConflict = response.VersionConflict,
                    },
                });
            }

            return Ok(new
            {
                ok = true,
                action = "action-apply",
                payload = new
                {
                    success = true,
                    projectDirectory = ActionProjectCatalog.GetRelativeProjectDirectory(
                        projectDir,
                        workspaceRoot),
                    projectDirectoryAbsolute = projectDir,
                    actionId = response.ActionId,
                    editVersion = response.EditVersion,
                    versionConflict = response.VersionConflict,
                    warnings = HeadlessCliResponses.ToWarningsArray(response.Warnings),
                },
            });
        }
        catch (Exception ex)
        {
            return Fail("ACTION_APPLY_FAILED", ex.Message);
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

    private static string? ResolveWorkspaceRoot(JsonElement args) =>
        ServeJsonArgs.GetString(args, "workspaceRoot", "workspace", "cwd");

    private static ServeInvokeResponse Ok(object data) =>
        new() { Ok = true, Data = data };

    private static ServeInvokeResponse Fail(string code, string message) =>
        new() { Ok = false, Error = code, Message = message };
}
