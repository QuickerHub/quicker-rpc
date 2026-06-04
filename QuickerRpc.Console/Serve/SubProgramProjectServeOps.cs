using System.Text.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

/// <summary>Local .quicker subprogram export/import for qkrpc serve.</summary>
internal static class SubProgramProjectServeOps
{
    internal static ServeInvokeResponse Validate(JsonElement args)
    {
        var explicitDir = ServeJsonArgs.GetString(args, "dir");
        if (string.IsNullOrWhiteSpace(explicitDir))
        {
            return Fail("MISSING_DIR", "args.dir is required.");
        }

        string projectDir;
        try
        {
            projectDir = QuickerProjectLayout.ResolveProjectDirectory(explicitDir);
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

            var info = QuickerProjectFiles.ReadSubProgramInfo(projectDir);
            var subProgramId = (info.Id ?? info.Name ?? string.Empty).Trim();
            if (subProgramId.Length == 0)
            {
                return Fail("MISSING_ID", "info.json must contain id or name.");
            }

            var data = QuickerProjectFiles.ReadData(projectDir);
            var validateResult = XActionFileRefValidator.Validate(data, projectDir);
            return Ok(new
            {
                ok = validateResult.Success,
                action = "subprogram-validate",
                payload = new
                {
                    success = validateResult.Success,
                    error = validateResult.ErrorMessage,
                    projectDirectory = projectDir,
                    subProgramId,
                    editVersion = info.EditVersion,
                    stepCount = validateResult.StepCount,
                    variableCount = validateResult.VariableCount,
                    fileRefs = validateResult.FileRefs,
                },
            });
        }
        catch (Exception ex)
        {
            return Fail("SUBPROGRAM_VALIDATE_FAILED", ex.Message);
        }
    }

    internal static async Task<ServeInvokeResponse> ExportAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ID", "args.id is required.");
        }

        var explicitDir = ServeJsonArgs.GetString(args, "dir");
        if (string.IsNullOrWhiteSpace(explicitDir))
        {
            return Fail("MISSING_DIR", "args.dir is required.");
        }

        string projectDir;
        try
        {
            projectDir = QuickerProjectLayout.ResolveProjectDirectory(explicitDir);
        }
        catch (Exception ex)
        {
            return Fail("INVALID_DIR", ex.Message);
        }

        try
        {
            var fullResponse = await rpc
                .GetCompressedSubProgramAsync(id.Trim(), "full", token)
                .ConfigureAwait(false);
            if (!fullResponse.Success || string.IsNullOrWhiteSpace(fullResponse.CompressedJson))
            {
                return Fail(
                    "EXPORT_GET_FAILED",
                    fullResponse.ErrorMessage ?? "subprogram get (full) failed.");
            }

            var metaResponse = await rpc
                .GetCompressedSubProgramAsync(id.Trim(), "metadata", token)
                .ConfigureAwait(false);

            var latestData = ParseProgramBodyFromCompressed(fullResponse.CompressedJson);
            QuickerProjectFiles.TryReadDataIfExists(projectDir, out var templateData);
            var exportResult = XActionFileRefExporter.Export(latestData, projectDir, templateData);
            if (!exportResult.Success || exportResult.ExportedData is null)
            {
                return Fail("EXPORT_FAILED", exportResult.ErrorMessage ?? "export failed.");
            }

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
            Directory.CreateDirectory(projectDir);
            QuickerProjectFiles.WriteSubProgramInfo(projectDir, info);
            ActionProjectResourceFile.WriteAll(projectDir, exportResult.ResourceFiles);
            QuickerProjectFiles.WriteData(projectDir, exportResult.ExportedData);
            var writtenFiles = exportResult.ResourceFiles
                .Select(f => XActionFileRefPath.NormalizeRelativePath(f.RelativePath))
                .ToList();

            return Ok(new
            {
                ok = true,
                action = "subprogram-export",
                payload = new
                {
                    success = true,
                    projectDirectory = projectDir,
                    subProgramId = info.Id,
                    name = info.Name,
                    callIdentifier = info.CallIdentifier,
                    editVersion = info.EditVersion,
                    writtenFiles,
                    warnings = exportResult.Warnings,
                },
            });
        }
        catch (Exception ex)
        {
            return Fail("SUBPROGRAM_EXPORT_FAILED", ex.Message);
        }
    }

    internal static async Task<ServeInvokeResponse> ImportAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var explicitDir = ServeJsonArgs.GetString(args, "dir");
        if (string.IsNullOrWhiteSpace(explicitDir))
        {
            return Fail("MISSING_DIR", "args.dir is required.");
        }

        string projectDir;
        try
        {
            projectDir = QuickerProjectLayout.ResolveProjectDirectory(explicitDir);
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

            var info = QuickerProjectFiles.ReadSubProgramInfo(projectDir);
            var subProgramId = (info.Id ?? info.Name ?? string.Empty).Trim();
            if (subProgramId.Length == 0)
            {
                return Fail("MISSING_ID", "info.json must contain id or name.");
            }

            var data = QuickerProjectFiles.ReadData(projectDir);
            var compileResult = XActionFileRefCompiler.Compile(data, projectDir);
            if (!compileResult.Success || compileResult.CompiledData is null)
            {
                return Ok(new
                {
                    ok = false,
                    action = "subprogram-import",
                    payload = new
                    {
                        success = false,
                        error = compileResult.ErrorMessage ?? "file compile failed.",
                        projectDirectory = projectDir,
                    },
                });
            }

            var expectedVersion = ServeJsonArgs.GetLong(args, "expectedEditVersion") ?? info.EditVersion;
            var force = ServeJsonArgs.GetBool(args, "force");
            var response = await rpc
                .ApplyProgramToSubProgramAsync(
                    subProgramId,
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
                    action = "subprogram-import",
                    payload = new
                    {
                        success = false,
                        error = response.ErrorMessage ?? "subprogram replace failed.",
                        versionConflict = response.VersionConflict,
                    },
                });
            }

            return Ok(new
            {
                ok = true,
                action = "subprogram-import",
                payload = new
                {
                    success = true,
                    subProgramId = response.SubProgramId,
                    callIdentifier = response.CallIdentifier,
                    editVersion = response.EditVersion,
                    versionConflict = response.VersionConflict,
                    warnings = HeadlessCliResponses.ToWarningsArray(response.Warnings),
                },
            });
        }
        catch (Exception ex)
        {
            return Fail("SUBPROGRAM_IMPORT_FAILED", ex.Message);
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

    private static ServeInvokeResponse Ok(object data) =>
        new() { Ok = true, Data = data };

    private static ServeInvokeResponse Fail(string code, string message) =>
        new() { Ok = false, Error = code, Message = message };
}
