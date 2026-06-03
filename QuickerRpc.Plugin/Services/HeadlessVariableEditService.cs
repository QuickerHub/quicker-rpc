using System;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Domain;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Updates variable default values headlessly for global subprograms and local XAction programs.
/// </summary>
public sealed class HeadlessVariableEditService
{
    private readonly LegacyActionProgramAccessor? _actions;
    private readonly DataServiceSubProgramAccessor? _subPrograms;
    private readonly HeadlessActionProgramService _actionPrograms;
    private readonly HeadlessSubProgramProgramService _subProgramPrograms;

    public HeadlessVariableEditService(
        HeadlessActionProgramService actionPrograms,
        HeadlessSubProgramProgramService subProgramPrograms)
    {
        _actionPrograms = actionPrograms;
        _subProgramPrograms = subProgramPrograms;
        _actions = LegacyActionProgramAccessor.TryCreate();
        _subPrograms = DataServiceSubProgramAccessor.TryCreate();
    }

    public Task<QuickerRpcSubProgramVariableEditResult> EditVariableAsync(
        string targetIdOrName,
        string variableKey,
        string defaultValue)
    {
        var idOrName = (targetIdOrName ?? string.Empty).Trim();
        var key = (variableKey ?? string.Empty).Trim();
        var value = defaultValue ?? string.Empty;

        if (string.IsNullOrWhiteSpace(idOrName))
        {
            return Task.FromResult(Fail(null, null, null, null, "targetIdOrName is required."));
        }

        if (string.IsNullOrWhiteSpace(key))
        {
            return Task.FromResult(Fail(idOrName, null, null, null, "variableKey is required."));
        }

        if (!QuickerHost.IsRunningInQuicker())
        {
            return Task.FromResult(Fail(idOrName, null, key, value, "Not running inside Quicker."));
        }

        if (TryResolveSubProgram(idOrName, out var subProgramKey))
        {
            return Task.FromResult(EditSubProgramVariable(subProgramKey, idOrName, key, value));
        }

        if (ActionContextResolver.TryResolve(idOrName, out _, out _, out _))
        {
            return Task.FromResult(EditActionVariable(idOrName, key, value));
        }

        return Task.FromResult(Fail(
            idOrName,
            null,
            key,
            value,
            $"Target not found: {idOrName}. Expected a global subprogram name/id or a local action id."));
    }

    private QuickerRpcSubProgramVariableEditResult EditSubProgramVariable(
        string subProgramKey,
        string idOrName,
        string variableKey,
        string defaultValue)
    {
        if (_subPrograms is null)
        {
            return Fail(idOrName, QuickerRpcVariableTargetKinds.SubProgram, variableKey, defaultValue, "Headless subprogram save unavailable.");
        }

        if (!_subPrograms.TryGetByIdOrName(subProgramKey, out var subProgram, out var loadError))
        {
            return Fail(idOrName, QuickerRpcVariableTargetKinds.SubProgram, variableKey, defaultValue, loadError ?? $"Subprogram not found: {idOrName}");
        }

        var variables = SubProgramProgramSerialization.VariablesToJArray(subProgram!.Variables);
        if (!TryFindVariable(variables, variableKey, out var oldValue))
        {
            return Fail(
                idOrName,
                QuickerRpcVariableTargetKinds.SubProgram,
                variableKey,
                defaultValue,
                $"Variable '{variableKey}' not found in subprogram '{idOrName}'.");
        }

        var patchResult = _subProgramPrograms.ApplyPatchToSubProgram(
            subProgram.Id ?? subProgramKey,
            BuildVariablePatchJson(variableKey, defaultValue),
            expectedEditVersion: null,
            force: true);
        if (!patchResult.Success)
        {
            return Fail(
                idOrName,
                QuickerRpcVariableTargetKinds.SubProgram,
                variableKey,
                defaultValue,
                patchResult.ErrorMessage ?? "save_failed");
        }

        return Success(
            idOrName,
            QuickerRpcVariableTargetKinds.SubProgram,
            variableKey,
            oldValue,
            defaultValue);
    }

    private QuickerRpcSubProgramVariableEditResult EditActionVariable(
        string actionId,
        string variableKey,
        string defaultValue)
    {
        if (_actions is null || !_actions.IsAvailable)
        {
            return Fail(actionId, QuickerRpcVariableTargetKinds.Action, variableKey, defaultValue, "Headless action save unavailable.");
        }

        if (!_actions.TryGetById(actionId, out var action, out var loadError))
        {
            return Fail(actionId, QuickerRpcVariableTargetKinds.Action, variableKey, defaultValue, loadError ?? $"Action not found: {actionId}");
        }

        if (!_actions.IsXAction(action!))
        {
            return Fail(actionId, QuickerRpcVariableTargetKinds.Action, variableKey, defaultValue, $"Action {actionId} is not an XAction program.");
        }

        var payloadJson = _actions.GetPayloadJson(action!, out var hydrateError);
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            return Fail(actionId, QuickerRpcVariableTargetKinds.Action, variableKey, defaultValue, hydrateError ?? $"Action {actionId} has no XAction payload.");
        }

        var body = JObject.Parse(payloadJson);
        var (_, variables, _) = ActionProgramContent.ReadBodyArrays(body);
        if (!TryFindVariable(variables, variableKey, out var oldValue))
        {
            return Fail(
                actionId,
                QuickerRpcVariableTargetKinds.Action,
                variableKey,
                defaultValue,
                $"Variable '{variableKey}' not found in action '{actionId}'.");
        }

        var patchResult = _actionPrograms.ApplyActionPatchToAction(
            actionId,
            BuildVariablePatchJson(variableKey, defaultValue),
            expectedEditVersion: null,
            force: true);
        if (!patchResult.Success)
        {
            return Fail(
                actionId,
                QuickerRpcVariableTargetKinds.Action,
                variableKey,
                defaultValue,
                patchResult.ErrorMessage ?? "save_failed");
        }

        return Success(
            actionId,
            QuickerRpcVariableTargetKinds.Action,
            variableKey,
            oldValue,
            defaultValue);
    }

    private static bool TryResolveSubProgram(string idOrName, out string subProgramKey)
    {
        subProgramKey = idOrName;
        try
        {
            return AppState.DataService.GetGlobalSubProgram(idOrName) is not null;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryFindVariable(JArray variables, string variableKey, out string? oldValue)
    {
        oldValue = null;
        foreach (var token in variables)
        {
            if (token is not JObject variable)
            {
                continue;
            }

            var key = variable["key"]?.Value<string>() ?? variable["Key"]?.Value<string>();
            if (!string.Equals(key, variableKey, StringComparison.Ordinal))
            {
                continue;
            }

            oldValue = variable["defaultValue"]?.Value<string>()
                ?? variable["DefaultValue"]?.Value<string>()
                ?? string.Empty;
            return true;
        }

        return false;
    }

    private static string BuildVariablePatchJson(string variableKey, string defaultValue) =>
        new JObject
        {
            ["variables"] = new JArray
            {
                new JObject
                {
                    ["key"] = variableKey,
                    ["defaultValue"] = defaultValue,
                },
            },
        }.ToString(Formatting.None);

    private static QuickerRpcSubProgramVariableEditResult Success(
        string targetIdOrName,
        string targetKind,
        string variableKey,
        string? oldValue,
        string newValue)
    {
        var message = string.IsNullOrWhiteSpace(oldValue)
            ? $"变量 {variableKey} 已设为 {newValue}"
            : $"变量 {variableKey} 变更 {oldValue} => {newValue}";

        return new QuickerRpcSubProgramVariableEditResult
        {
            Ok = true,
            TargetKind = targetKind,
            SubProgramIdOrName = targetIdOrName,
            VariableKey = variableKey,
            OldValue = oldValue,
            NewValue = newValue,
            Message = message,
        };
    }

    private static QuickerRpcSubProgramVariableEditResult Fail(
        string? targetIdOrName,
        string? targetKind,
        string? variableKey,
        string? newValue,
        string message) =>
        new()
        {
            Ok = false,
            TargetKind = targetKind,
            SubProgramIdOrName = targetIdOrName,
            VariableKey = variableKey,
            NewValue = newValue,
            Message = message,
        };
}
