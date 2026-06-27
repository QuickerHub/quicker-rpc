using System.Text.Json;
using QuickerRpc.AgentModel.Schemas;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunSubProgramCreateAsync(SubProgramOptions options)
    {
        var name = (options.Name ?? options.Title ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_NAME", "Provide --name <subprogramName>.")
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .CreateGlobalSubProgramAsync(name, options.Description, options.Icon, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "subprogram-create",
                        subProgramId = result.SubProgramId,
                        name = result.Name,
                        callIdentifier = result.CallIdentifier,
                        editVersion = result.EditVersion,
                        message = result.Message,
                        programKind = ActionDataSchemaService.ProgramKindSubprogram,
                        dataSchema = ActionDataSchemaService.GetSchema(),
                        dataTemplate = ActionDataSchemaService.GetDataTemplate(ActionDataSchemaService.ProgramKindSubprogram),
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                global::System.Console.WriteLine(
                    $"{result.Message} id={result.SubProgramId} callIdentifier={result.CallIdentifier} editVersion={result.EditVersion}");
            }
            else
            {
                global::System.Console.Error.WriteLine(result.Message);
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "SUBPROGRAM_CREATE_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunSubProgramGetAsync(SubProgramOptions options)
    {
        var id = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ID", "Provide --id <subProgramIdOrName>.")
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .GetCompressedSubProgramAsync(id, options.ReturnMode, rpcToken)
                .ConfigureAwait(false);
            var payload = HeadlessCliResponses.ToSubProgramGetPayload(response);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new { ok = response.Success, action = "subprogram-get", payload },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
            }

            return response.Success ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "SUBPROGRAM_GET_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunSubProgramPatchAsync(SubProgramOptions options)
    {
        var id = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ID", "Provide --id <subProgramIdOrName>.")
                .ConfigureAwait(false);
        }

        var (jsonOk, jsonText, jsonErrorCode, jsonErrorMessage) =
            QkrpcJsonPayload.Resolve(options.Patch, options.PatchFile, "patch");
        if (!jsonOk)
        {
            return await EmitErrorAndFailAsync(options.Json, jsonErrorCode!, jsonErrorMessage!).ConfigureAwait(false);
        }

        if (!TryParseJsonObject(jsonText!, "patch", out var patchObj, out var parseError))
        {
            return await EmitErrorAndFailAsync(options.Json, "INVALID_PATCH_JSON", parseError!).ConfigureAwait(false);
        }

        if (!QkrpcPatchPreprocess.TryPreprocessPatch(patchObj!, options.PatchFile, out var preprocessError))
        {
            return await EmitErrorAndFailAsync(options.Json, "FORM_SPEC_COMPILE_FAILED", preprocessError!)
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .ApplySubProgramPatchAsync(
                    id,
                    patchObj!.ToString(Newtonsoft.Json.Formatting.None),
                    options.ExpectedEditVersion,
                    options.Force,
                    rpcToken)
                .ConfigureAwait(false);
            var payload = HeadlessCliResponses.ToSubProgramPatchPayload(response);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new { ok = response.Success, action = "subprogram-patch", payload },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
            }

            if (response.Success)
            {
                HeadlessCliResponses.WriteWarningsToStderr(response.Warnings);
            }

            return response.Success ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "SUBPROGRAM_PATCH_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunSubProgramReplaceAsync(SubProgramOptions options)
    {
        var id = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ID", "Provide --id <subProgramIdOrName>.")
                .ConfigureAwait(false);
        }

        var (jsonOk, jsonText, jsonErrorCode, jsonErrorMessage) =
            QkrpcJsonPayload.Resolve(options.Program, options.ProgramFile, "program");
        if (!jsonOk)
        {
            return await EmitErrorAndFailAsync(options.Json, jsonErrorCode!, jsonErrorMessage!).ConfigureAwait(false);
        }

        if (!TryParseJsonObject(jsonText!, "program", out var programObj, out var parseError))
        {
            return await EmitErrorAndFailAsync(options.Json, "INVALID_PROGRAM_JSON", parseError!).ConfigureAwait(false);
        }

        if (!QkrpcPatchPreprocess.TryPreprocessProgram(programObj!, options.ProgramFile, out var preprocessError))
        {
            return await EmitErrorAndFailAsync(options.Json, "FORM_SPEC_COMPILE_FAILED", preprocessError!)
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .ApplyProgramToSubProgramAsync(
                    id,
                    programObj!.ToString(Newtonsoft.Json.Formatting.None),
                    options.ExpectedEditVersion,
                    options.Force,
                    rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = response.Success,
                        action = "subprogram-replace",
                        success = response.Success,
                        errorMessage = response.ErrorMessage,
                        subProgramId = response.SubProgramId,
                        callIdentifier = response.CallIdentifier,
                        editVersion = response.EditVersion,
                        versionConflict = response.VersionConflict,
                        updatedUtc = response.UpdatedUtc,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (response.Success)
            {
                global::System.Console.WriteLine(
                    $"Replaced subprogram {response.SubProgramId} (editVersion {response.EditVersion}).");
            }
            else
            {
                global::System.Console.Error.WriteLine(response.ErrorMessage ?? "subprogram replace failed");
            }

            return response.Success ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "SUBPROGRAM_REPLACE_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunSubProgramListAsync(SubProgramOptions options)
    {
        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var query = (options.Query ?? string.Empty).Trim();
            var result = await session.Proxy
                .ListGlobalSubProgramsAsync(
                    string.IsNullOrWhiteSpace(query) ? null : query,
                    options.Limit,
                    rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "subprogram-list",
                        query,
                        count = result.Items.Count,
                        items = result.Items,
                    },
                    QkrpcJson.CliOutput));
            }
            else
            {
                foreach (var item in result.Items)
                {
                    global::System.Console.WriteLine($"{item.Id}\t{item.Name}\t{item.CallIdentifier}");
                }
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "SUBPROGRAM_LIST_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunSubProgramEditAsync(SubProgramOptions options)
    {
        var id = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ID", "Provide --id <subProgramIdOrName>.")
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy.EditGlobalSubProgramAsync(id, rpcToken).ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "subprogram-edit",
                        subProgramId = result.ActionId,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(result.Message);
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "SUBPROGRAM_EDIT_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunSubProgramDeleteAsync(SubProgramOptions options)
    {
        var id = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ID", "Provide --id <subProgramIdOrName>.")
                .ConfigureAwait(false);
        }

        if (!options.Yes)
        {
            return await EmitErrorAndFailAsync(options.Json, "CONFIRM_REQUIRED", "Add --yes to delete a subprogram.")
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy.DeleteGlobalSubProgramAsync(id, skipConfirm: true, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "subprogram-delete",
                        subProgramId = result.ActionId,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(result.Message);
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "SUBPROGRAM_DELETE_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunSubProgramEditVarAsync(SubProgramOptions options)
    {
        var id = (options.Id ?? options.Code ?? string.Empty).Trim();
        var variableKey = (options.Variable ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ID", "Provide --id <subProgramIdOrName>.")
                .ConfigureAwait(false);
        }

        if (string.IsNullOrWhiteSpace(variableKey))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_VAR", "Provide --var <variableKey>.")
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .EditGlobalSubProgramVariableAsync(id, variableKey, options.Value ?? string.Empty, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "subprogram-edit-var",
                        targetKind = result.TargetKind,
                        subProgramIdOrName = result.SubProgramIdOrName,
                        variableKey = result.VariableKey,
                        oldValue = result.OldValue,
                        newValue = result.NewValue,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(result.Message);
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "SUBPROGRAM_EDIT_VAR_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }
}
