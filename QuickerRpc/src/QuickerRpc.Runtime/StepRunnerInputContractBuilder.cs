using System;
using System.Collections.Generic;
using System.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Proto;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Runtime;

/// <summary>Projects verified native facts without changing the legacy catalog/Agent formatter.</summary>
public static class StepRunnerInputContractBuilder
{
    public static QuickerRpcStepRunnerInputContractResult Build(StepRunnerCatalog catalog,
        QuickerRpcStepRunnerInputContractRequest request) => Build(catalog, request, "v1");

    public static QuickerRpcStepRunnerInputContractResult Build(StepRunnerCatalog catalog,
        QuickerRpcStepRunnerInputContractRequest request, string hostKind)
    {
        if (hostKind is not ("v1" or "v2"))
            return Failure("UNSUPPORTED_HOST", "Runtime input contracts require an explicit supported host kind.");
        if (request is null || string.IsNullOrWhiteSpace(request.StepRunnerKey))
            return Failure("INVALID_INPUT_CONTRACT_REQUEST", "A step runner key is required.");
        var runner = catalog.TryFind(request.StepRunnerKey);
        if (runner is null) return Failure("STEP_RUNNER_NOT_FOUND", "The requested runtime step runner was not found.");
        if (catalog.Items.Count(item => string.Equals(item.Key, runner.Key, StringComparison.OrdinalIgnoreCase)) != 1)
            return Failure("INPUT_CONTRACT_AMBIGUOUS", "Runtime step runner keys must be unique.");
        var inputs = runner.InputParamDefs;
        if (inputs.Any(p => string.IsNullOrWhiteSpace(p.Key))
            || inputs.GroupBy(p => p.Key, StringComparer.OrdinalIgnoreCase).Any(g => g.Count() != 1))
            return Failure("INPUT_CONTRACT_AMBIGUOUS", "Runtime input keys must be unique and nonempty.");

        var controls = inputs.Where(p => p.NativeInputPolicy?.IsControlField == true).ToList();
        var controlMetadataKnown = inputs.All(p => p.NativeInputPolicy?.IsControlField.HasValue == true) && controls.Count <= 1;
        var control = controls.Count == 1 ? controls[0] : null;
        var facts = control?.NativeInputPolicy;
        var controlValue = request.ControlFieldValue;
        var controlValueKnown = false;
        if (control is null)
        {
            if (request.ControlFieldValue is not null)
                return Failure("INVALID_CONTROL_FIELD_VALUE", "This runtime definition has no control field.");
            controlValueKnown = controlMetadataKnown;
        }
        else if (controlMetadataKnown && facts is { VarType: 9, SelectionKnown: true })
        {
            controlValue ??= facts.DefaultControlValue;
            controlValueKnown = controlValue is not null && facts.Options.Contains(controlValue, StringComparer.OrdinalIgnoreCase);
            if (request.ControlFieldValue is not null && !controlValueKnown)
                return Failure("INVALID_CONTROL_FIELD_VALUE", "The requested control value is not a native option.");
        }

        var contract = new QuickerRpcStepRunnerInputContract
        {
            Source = "runtime-definition", HostKind = hostKind, StepRunnerKey = runner.Key,
            ControlFieldKey = control?.Key,
            AppliedControlFieldValue = controlValueKnown ? controlValue : null,
            ReservedBindings = new List<string> { "file", "varKey", InputParamWireCoercer.FileKeySuffix, InputParamWireCoercer.VarKeySuffix },
        };
        foreach (var input in inputs)
        {
            var native = input.NativeInputPolicy;
            var row = new QuickerRpcStepRunnerInputContractInput
            {
                Key = input.Key, VarType = native?.VarType, VariableMode = native?.VariableMode,
                AllowInput = native?.AllowInput, IsControlField = native?.IsControlField,
                PolicyKnown = native?.PolicyKnown == true,
                Options = native?.SelectionKnown == true ? new List<string>(native.Options) : new List<string>(),
            };
            var visibility = ResolveVisibility(native, control?.Key, contract.AppliedControlFieldValue,
                controlMetadataKnown && controlValueKnown, inputs, out var visibilityReason);
            if (runner.InputContractVisibilityUnknownReason is not null)
            {
                visibility = null;
                visibilityReason = runner.InputContractVisibilityUnknownReason;
            }
            row.VisibilityResolved = visibility.HasValue;
            row.Visible = visibility == true;
            if (!row.PolicyKnown) Block(row, "unknown", "NATIVE_INPUT_POLICY_UNKNOWN");
            else if (!row.VisibilityResolved) Block(row, "unknown", visibilityReason ?? "NATIVE_INPUT_VISIBILITY_UNKNOWN");
            else if (!row.Visible) Block(row, "never", "INPUT_NOT_VISIBLE");
            else if (row.IsControlField == true) Block(row, "never", "CONTROL_FIELD_NOT_EDITABLE");
            else ResolveLiteral(row, native!);
            contract.Inputs.Add(row);
        }
        contract.VisibilityResolved = controlMetadataKnown && controlValueKnown && contract.Inputs.All(p => p.VisibilityResolved);
        return new() { Success = true, Contract = contract };
    }

    private static bool? ResolveVisibility(StepRunnerNativeInputPolicy? facts, string? controlKey, string? controlValue, bool controlKnown,
        IList<StepRunnerInputParamDef> inputs, out string? reason)
    {
        reason = null;
        if (facts is null || !facts.VisibilityKnown || !controlKnown) return null;
        if (!string.IsNullOrWhiteSpace(facts.VisibleExpression))
        { reason = "NATIVE_VISIBILITY_EXPRESSION_REQUIRES_TYPED_CONTEXT"; return null; }
        if (facts.IsControlField == true) return true;
        // Native ValidForListShows(empty) is false; null is the distinct absence of a rule.
        if (facts.HasValidFor && facts.ValidFor.Count == 0) return false;
        if (facts.ValidFor.Count > 0 || facts.InvalidFor.Count > 0)
        {
            // Multiple concurrent rule forms have not been proven equivalent to the native editor.
            if ((facts.ValidFor.Count > 0 && facts.InvalidFor.Count > 0)
                || controlKey is null || controlValue is null) return null;
            var list = facts.ValidFor.Count > 0 ? facts.ValidFor : facts.InvalidFor;
            if (!ListBindsToControl(list, inputs, controlKey, out var requiredInput))
            {
                if (requiredInput is not null) reason = "NATIVE_INPUT_VISIBILITY_REQUIRES_INPUT:" + requiredInput;
                return null;
            }
            return facts.ValidFor.Count > 0
                ? facts.ValidFor.Contains(controlValue, StringComparer.OrdinalIgnoreCase)
                : !facts.InvalidFor.Contains(controlValue, StringComparer.OrdinalIgnoreCase);
        }
        return true;
    }

    private static bool ListBindsToControl(IList<string> list, IList<StepRunnerInputParamDef> inputs, string controlKey, out string? requiredInput)
    {
        requiredInput = null;
        // Native rules prefer enum option sets, then explicitly declared non-enum fixed options.
        // This request knows only the control literal, never another input's current value.
        if (inputs.Any(input => input.NativeInputPolicy is null || !input.NativeInputPolicy.VarType.HasValue
            || !input.NativeInputPolicy.SelectionKnown || !input.NativeInputPolicy.OptionalPolicyKnown)) return false;
        var candidates = inputs.Where(input => input.NativeInputPolicy!.VarType == 9)
            .Concat(inputs.Where(input => input.NativeInputPolicy!.VarType != 9
                && ((input.NativeInputPolicy.InputSources ?? 0) & 1) != 0));
        foreach (var candidate in candidates)
        {
            var options = candidate.NativeInputPolicy!.Options;
            if (options.Count > 0 && list.All(value => value.Length > 0 && options.Contains(value, StringComparer.OrdinalIgnoreCase)))
            {
                if (string.Equals(candidate.Key, controlKey, StringComparison.Ordinal)) return true;
                requiredInput = candidate.Key;
                return false;
            }
        }
        return true; // Native fallback is the sole explicitly marked control.
    }

    private static void ResolveLiteral(QuickerRpcStepRunnerInputContractInput row, StepRunnerNativeInputPolicy facts)
    {
        if (facts.EditorHint is > 0 || string.Equals(row.Key, "texttools", StringComparison.OrdinalIgnoreCase))
        { Block(row, "unknown", "SPECIAL_NATIVE_EDITOR_UNSUPPORTED"); return; }
        if (row.VarType is not (0 or 1 or 2 or 9 or 12))
        { Block(row, "unknown", "LITERAL_VALUE_TYPE_UNSUPPORTED"); return; }
        var restriction = "none";
        var sources = facts.InputSources ?? 0;
        if (sources != 0)
        {
            if ((sources & 2) == 0)
            {
                if ((sources & 1) != 0 && row.Options.Count > 0) restriction = "options";
                else { Block(row, "never", "NATIVE_LITERAL_SOURCE_NOT_ALLOWED"); return; }
            }
        }
        else if (row.VarType == 9 && row.VariableMode == 1 && row.AllowInput == false)
        {
            if (row.Options.Count == 0) { Block(row, "never", "NATIVE_FIXED_OPTIONS_EMPTY"); return; }
            restriction = "options";
        }
        row.LiteralPolicy = row.VariableMode switch
        {
            0 or 1 => "allowed",
            2 => "existing-literal-only",
            3 => "existing-nonempty-literal-only",
            _ => "unknown",
        };
        row.LiteralValueRestriction = restriction;
    }

    private static void Block(QuickerRpcStepRunnerInputContractInput row, string policy, string reason)
    {
        row.LiteralPolicy = policy; row.LiteralValueRestriction = "unknown"; row.BlockedReason = reason;
    }

    public static QuickerRpcStepRunnerInputContractResult Failure(string code, string error) =>
        new() { Success = false, ErrorCode = code, ErrorMessage = error };
}
