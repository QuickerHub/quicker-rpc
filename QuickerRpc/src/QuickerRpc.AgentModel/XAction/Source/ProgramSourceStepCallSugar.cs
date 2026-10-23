// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// M3 step-call sugar: <c>evalexpression: { ... }</c> / <c>>>: var</c>
/// ↔ <c>key</c> + <c>inputs</c> + <c>outputs</c>.
/// Short names are derived uniformly from <c>sys:{local}</c> runner keys.
/// </summary>
public static class ProgramSourceStepCallSugar
{
    private const string SysPrefix = "sys:";

    private static readonly HashSet<string> ReservedStepKeys = new(StringComparer.Ordinal)
    {
        "key",
        "inputs",
        "outputs",
        "ifSteps",
        "elseSteps",
        "note",
        "disabled",
        "collapsed",
        "delayMs",
        "stepId",
        "if",
        "then",
        "else",
        "else if",
        "loopSteps",
        // Elevated subprogram target field (camelCase); lowercase "subprogram" remains M3 short name.
        "subProgram",
    };

    internal const string EachRunnerKey = ProgramSourceEachSugar.EachRunnerKey;

    /// <summary>
    /// Static map for M3 <c>>></c> (the codec itself is catalog-free, so encode and decode agree
    /// without a catalog). Must stay aligned with <see cref="OutputParamAttribute.IsSourcePrimary"/>
    /// on runners. Unlisted runners use Key <c>output</c> by convention; when decode is given a
    /// catalog, a known runner that does not declare that key rejects <c>>></c>
    /// (<see cref="ProgramSourceCodes.NoPrimaryOutput"/>) instead of binding a nonexistent output.
    /// </summary>
    private static readonly Dictionary<string, string> PrimaryOutputKey = new(StringComparer.Ordinal)
    {
        // Only runners whose IsSourcePrimary output is not named "output" need an entry
        // (Quicker.StepV2Test/ProgramSourceSugarTablesTests keeps this aligned with the attrs).
        ["sys:GenTempFilePath"] = "filePath",
        ["sys:ai"] = "result",
        ["sys:aiChat"] = "result",
        ["sys:aiClassify"] = "categoryKey",
        ["sys:aiExtract"] = "resultObject",
        ["sys:aiText"] = "result",
        ["sys:aiVision"] = "result",
        ["sys:automationScript"] = "result",
        ["sys:basic-ocr"] = "content",
        ["sys:dictOperations"] = "value",
        ["sys:download"] = "savedPath",
        ["sys:everythingsearch"] = "pathList",
        ["sys:getFolderPath"] = "path",
        ["sys:imgProcess"] = "result",
        ["sys:jsscript"] = "return",
        ["sys:longScreenshot"] = "img",
        ["sys:numCompare"] = "value",
        ["sys:readQrCode"] = "code",
        ["sys:screenCapture"] = "img",
        ["sys:selectFolder"] = "path",
        ["sys:strCompare"] = "value",
        ["sys:tempImgBed"] = "url",
        ["sys:tempcloudstore"] = "url",
        ["sys:translation"] = "resultText",
        ["sys:whiteboard"] = "result",
        ["sys:reactui"] = "result",
    };

    /// <summary>
    /// Fallback map for M3 primary-input scalars when catalog attrs are not loaded.
    /// Must stay aligned with <see cref="InputParamAttribute.IsSourcePrimary"/> on runners
    /// (sys:comment.note, sys:notify.msg). sys:if.condition is handled by
    /// <see cref="ProgramSourceIfSugar"/> (<c>if: "…"</c>), not this map.
    /// </summary>
    private static readonly Dictionary<string, string> PrimaryInputKey = new(StringComparer.Ordinal)
    {
        ["sys:comment"] = "note",
        ["sys:log"] = "message",
        ["sys:notify"] = "msg",
    };

    /// <summary>Fallback tables, exposed so the real-registry gate can compare them with the runner attrs.</summary>
    internal static IReadOnlyDictionary<string, string> PrimaryInputKeys => PrimaryInputKey;

    internal static IReadOnlyDictionary<string, string> PrimaryOutputKeys => PrimaryOutputKey;

    public static void DesugarInPlace(JObject root) => DesugarInPlace(root, catalog: null);

    /// <param name="root">Program (or subprogram) source object, desugared in place.</param>
    /// <param name="catalog">
    /// Optional runner catalog. When given, <c>>></c> on a catalog-known runner without the primary
    /// output key fails with <see cref="ProgramSourceCodes.NoPrimaryOutput"/>; unknown runners and a
    /// null catalog keep the catalog-free convention.
    /// </param>
    public static void DesugarInPlace(JObject root, StepRunnerCatalog? catalog)
    {
        if (root["steps"] is JArray steps)
        {
            DesugarSteps(steps, catalog);
        }

        if (root["subPrograms"] is JArray subs)
        {
            foreach (var sp in subs.OfType<JObject>())
            {
                DesugarInPlace(sp, catalog);
            }
        }
    }

    public static void ResugarInPlace(JObject root)
    {
        if (root["steps"] is JArray steps)
        {
            ResugarSteps(steps);
        }

        if (root["subPrograms"] is JArray subs)
        {
            foreach (var sp in subs.OfType<JObject>())
            {
                ResugarInPlace(sp);
            }
        }
    }

    private static void DesugarSteps(JArray steps, StepRunnerCatalog? catalog)
    {
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            if (TryDesugarCall(step, catalog, out var wire))
            {
                steps[i] = wire;
                step = wire;
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                DesugarSteps(ifSteps, catalog);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                DesugarSteps(elseSteps, catalog);
            }
        }
    }

    private static void ResugarSteps(JArray steps)
    {
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                ResugarSteps(ifSteps);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                ResugarSteps(elseSteps);
            }

            if (TryResugarCall(step, out var sugared))
            {
                steps[i] = sugared;
            }
        }
    }

    private static bool TryDesugarCall(JObject step, StepRunnerCatalog? catalog, out JObject wire)
    {
        wire = step;
        if (step["key"] is not null || step["if"] is not null)
        {
            return false;
        }

        if (step.Count != 1)
        {
            return false;
        }

        var prop = step.Properties().First();
        if (ReservedStepKeys.Contains(prop.Name))
        {
            return false;
        }

        if (!TryResolveRunnerKey(prop.Name, out var runnerKey))
        {
            return false;
        }

        wire = ExpandCall(runnerKey, prop.Value, step, catalog);
        return true;
    }

    internal static JObject ExpandStepCall(
        string runnerKey,
        JToken? value,
        JObject sourceStep,
        StepRunnerCatalog? catalog) =>
        ExpandCall(runnerKey, value, sourceStep, catalog);

    private static JObject ExpandCall(
        string runnerKey,
        JToken? value,
        JObject sourceStep,
        StepRunnerCatalog? catalog)
    {
        var result = new JObject { ["key"] = runnerKey };
        CopyLocation(sourceStep, result);

        if (value is null || value.Type is JTokenType.Null)
        {
            return result;
        }

        if (IsPlainScalar(value))
        {
            if (!PrimaryInputKey.TryGetValue(runnerKey, out var primaryInput))
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.UnknownSugar,
                    $"Step call '{runnerKey}' value must be a mapping or null."
                    + ProgramSourceLocations.FormatStepContext(sourceStep, string.Empty));
            }

            result["inputs"] = new JObject { [primaryInput] = value.DeepClone() };
            return result;
        }

        if (value is not JObject body)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.UnknownSugar,
                $"Step call '{runnerKey}' value must be a mapping, null, or primary-input scalar."
                + ProgramSourceLocations.FormatStepContext(sourceStep, string.Empty));
        }

        JObject? outputs = null;
        JObject? inputs = null;

        if (string.Equals(runnerKey, EachRunnerKey, StringComparison.Ordinal)
            && body["then"] is not null
            && body["loopSteps"] is not null)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.UnknownSugar,
                "each cannot set both then and loopSteps."
                + ProgramSourceLocations.FormatStepContext(sourceStep, string.Empty));
        }

        foreach (var prop in body.Properties())
        {
            if (prop.Name == ">>")
            {
                outputs ??= new JObject();
                if (outputs.Count > 0)
                {
                    throw new ProgramSourceException(
                        ProgramSourceCodes.MixedBind,
                        $"Step '{runnerKey}' cannot mix >> with outputs."
                        + ProgramSourceLocations.FormatStepContext(sourceStep, string.Empty));
                }

                var primary = ResolveDecodePrimaryOutputKey(runnerKey, prop.Value, sourceStep, catalog);
                outputs[primary] = prop.Value.DeepClone();
                continue;
            }

            if (prop.Name == "outputs")
            {
                if (prop.Value is not JObject outMap)
                {
                    throw new ProgramSourceException(
                        ProgramSourceCodes.CawInvalid,
                        $"Step '{runnerKey}' outputs must be a mapping."
                        + ProgramSourceLocations.FormatStepContext(sourceStep, string.Empty));
                }

                if (outputs is not null)
                {
                    throw new ProgramSourceException(
                        ProgramSourceCodes.MixedBind,
                        $"Step '{runnerKey}' cannot mix >> with outputs."
                        + ProgramSourceLocations.FormatStepContext(sourceStep, string.Empty));
                }

                outputs = (JObject)outMap.DeepClone();
                continue;
            }

            if (prop.Name is "then" or "loopSteps")
            {
                AttachEachBodyList(result, runnerKey, prop.Name, prop.Value, sourceStep);
                continue;
            }

            // Remaining keys are folded input forms (still may contain {file:}/{var:}).
            inputs ??= new JObject();
            inputs[prop.Name] = prop.Value.DeepClone();
        }

        if (inputs is { Count: > 0 })
        {
            result["inputs"] = inputs;
        }

        if (outputs is { Count: > 0 })
        {
            result["outputs"] = outputs;
        }

        return result;
    }

    private static void CopyLocation(JObject from, JObject to)
    {
        var loc = ProgramSourceLocations.TryGet(from);
        if (loc is not null)
        {
            ProgramSourceLocations.Annotate(to, loc.LineNumber, loc.LineText);
        }
    }

    private static bool TryResugarCall(JObject step, out JObject sugared)
    {
        sugared = step;
        var runner = step.Value<string>("key");
        if (string.IsNullOrEmpty(runner)
            || string.Equals(runner, "sys:if", StringComparison.Ordinal)
            || string.Equals(runner, ProgramSourceSubProgramStepSugar.RunnerKey, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        foreach (var name in new[] { "note", "disabled", "collapsed", "delayMs", "stepId", "ifSteps", "elseSteps" })
        {
            if (step[name] is not null)
            {
                return false;
            }
        }

        // Only known properties.
        foreach (var prop in step.Properties())
        {
            if (prop.Name is not "key" and not "inputs" and not "outputs")
            {
                return false;
            }
        }

        var body = new JObject();
        if (step["inputs"] is JObject inputs)
        {
            // A SourceImplied control equal to what the other bound inputs imply is dropped;
            // decode re-derives it (ProgramSourceControlImplication), so the form stays bijective.
            var impliedControl = ProgramSourceControlImplication.TryGet(runner) is { } table
                && ProgramSourceControlImplication.CanOmit(table, inputs)
                ? table.ControlKey
                : null;

            foreach (var prop in inputs.Properties())
            {
                // M3 body reserves >> / outputs for step outputs, and then/loopSteps
                // for each-sugar. Keep S0 when an input literally uses those names
                // so Encode/Decode stay bijective.
                if (prop.Name is ">>" or "outputs" or "then" or "loopSteps")
                {
                    return false;
                }

                if (impliedControl is not null
                    && string.Equals(prop.Name, impliedControl, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                body[prop.Name] = prop.Value.DeepClone();
            }
        }

        if (step["outputs"] is JObject outputs)
        {
            if (outputs.Count == 1)
            {
                var only = outputs.Properties().First();
                var primary = GetPrimaryOutputKey(runner);
                if (string.Equals(only.Name, primary, StringComparison.Ordinal))
                {
                    body[">>"] = only.Value.DeepClone();
                }
                else
                {
                    body["outputs"] = outputs.DeepClone();
                }
            }
            else if (outputs.Count > 1)
            {
                body["outputs"] = outputs.DeepClone();
            }
        }

        if (!TryDeriveShortName(runner, out var shortName))
        {
            return false;
        }

        sugared = new JObject
        {
            [shortName] = CollapseCallBody(runner, body),
        };
        return true;
    }

    /// <summary>
    /// Resugar <c>sys:each</c> with a nonempty <c>ifSteps</c> body to
    /// <c>each: { …, then: [ … ] }</c>. Call after if-sugar so nested <c>if</c> is already sugared.
    /// </summary>
    internal static bool TryResugarEachWithThen(JObject step, out JObject sugared)
    {
        sugared = step;
        var runner = step.Value<string>("key");
        if (!string.Equals(runner, EachRunnerKey, StringComparison.Ordinal))
        {
            return false;
        }

        if (step["ifSteps"] is not JArray ifSteps || ifSteps.Count == 0)
        {
            return false;
        }

        foreach (var name in new[] { "note", "disabled", "collapsed", "delayMs", "stepId", "elseSteps" })
        {
            if (step[name] is not null)
            {
                return false;
            }
        }

        foreach (var prop in step.Properties())
        {
            if (prop.Name is not "key" and not "inputs" and not "outputs" and not "ifSteps")
            {
                return false;
            }
        }

        var body = new JObject();
        if (step["inputs"] is JObject inputs)
        {
            foreach (var prop in inputs.Properties())
            {
                if (prop.Name is ">>" or "outputs" or "then" or "loopSteps")
                {
                    return false;
                }

                body[prop.Name] = prop.Value.DeepClone();
            }
        }

        if (step["outputs"] is JObject outputs)
        {
            if (outputs.Count == 1)
            {
                var only = outputs.Properties().First();
                var primary = GetPrimaryOutputKey(EachRunnerKey);
                if (string.Equals(only.Name, primary, StringComparison.Ordinal))
                {
                    body[">>"] = only.Value.DeepClone();
                }
                else
                {
                    body["outputs"] = outputs.DeepClone();
                }
            }
            else if (outputs.Count > 1)
            {
                body["outputs"] = outputs.DeepClone();
            }
        }

        body["then"] = ifSteps.DeepClone();
        sugared = new JObject { ["each"] = body };
        return true;
    }

    private static void AttachEachBodyList(
        JObject result,
        string runnerKey,
        string propName,
        JToken value,
        JObject sourceStep)
    {
        if (!string.Equals(runnerKey, EachRunnerKey, StringComparison.Ordinal))
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.UnknownSugar,
                $"{propName} is only valid on each."
                + ProgramSourceLocations.FormatStepContext(sourceStep, string.Empty));
        }

        if (value is not JArray list)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.UnknownSugar,
                $"{propName} must be a step list."
                + ProgramSourceLocations.FormatStepContext(sourceStep, string.Empty));
        }

        if (result["ifSteps"] is not null)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.UnknownSugar,
                "each cannot set both then and loopSteps."
                + ProgramSourceLocations.FormatStepContext(sourceStep, string.Empty));
        }

        if (list.Count > 0)
        {
            result["ifSteps"] = list.DeepClone();
        }
    }

    /// <summary>
    /// Empty → null; single primary-input single-line scalar → that scalar; else mapping body.
    /// Multiline strings stay as <c>note:</c>/<c>msg:</c> mapping so block scalars keep indent.
    /// </summary>
    private static JToken CollapseCallBody(string runnerKey, JObject body)
    {
        if (body.Count == 0)
        {
            return JValue.CreateNull();
        }

        if (body.Count == 1
            && PrimaryInputKey.TryGetValue(runnerKey, out var primary)
            && body.Property(primary) is { Value: var only }
            && CanEmitAsCallScalar(only))
        {
            return only.DeepClone();
        }

        return body;
    }

    private static bool IsPlainScalar(JToken token) =>
        token.Type is JTokenType.String
            or JTokenType.Integer
            or JTokenType.Float
            or JTokenType.Boolean;

    /// <summary>Scalars safe to place directly after <c>shortName:</c> without a nested mapping.</summary>
    private static bool CanEmitAsCallScalar(JToken token) =>
        token.Type is JTokenType.Integer or JTokenType.Float or JTokenType.Boolean
        || (token.Type is JTokenType.String
            && token.Value<string>() is { } s
            && !s.Contains('\n')
            && !s.Contains('\r'));

    /// <summary>
    /// Map M3 short name to runner key: <c>assign</c> → <c>sys:assign</c>.
    /// Non-<c>sys:</c> namespaces and S1 reserved keys stay on S0 wire form.
    /// </summary>
    private static bool TryResolveRunnerKey(string name, out string runnerKey)
    {
        runnerKey = string.Empty;
        if (string.IsNullOrWhiteSpace(name) || ReservedStepKeys.Contains(name))
        {
            return false;
        }

        runnerKey = SysPrefix + name;
        return true;
    }

    /// <summary>
    /// Map runner key to M3 short name when it is a single-segment <c>sys:*</c> key
    /// with the canonical lowercase <c>sys:</c> prefix.
    /// </summary>
    private static bool TryDeriveShortName(string runnerKey, out string shortName)
    {
        shortName = string.Empty;
        if (!runnerKey.StartsWith(SysPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var local = runnerKey.Substring(SysPrefix.Length);
        if (local.Length == 0 || local.Contains(':', StringComparison.Ordinal))
        {
            return false;
        }

        shortName = local;
        return !ReservedStepKeys.Contains(shortName);
    }

    private static string GetPrimaryOutputKey(string runnerKey) =>
        PrimaryOutputKey.TryGetValue(runnerKey, out var key) ? key : "output";

    /// <summary>
    /// Decode-side <c>>></c> target. The key comes from the static table / <c>output</c> convention,
    /// exactly as encode folds it, so every <c>>></c> encode can emit from valid data still decodes.
    /// With a catalog, a known runner whose output list lacks that key is rejected: the old silent
    /// result was <c>outputs.output</c> on a step that never writes it, so the variable stayed empty
    /// (e.g. <c>screenCapture: { >>: img }</c> — sys:screenCapture outputs isSuccess / img / rect).
    /// Unknown runners and a definition without listed outputs (incomplete metadata) keep the
    /// convention, like the input-key check in workspace validate.
    /// </summary>
    private static string ResolveDecodePrimaryOutputKey(
        string runnerKey,
        JToken boundValue,
        JObject sourceStep,
        StepRunnerCatalog? catalog)
    {
        var primary = GetPrimaryOutputKey(runnerKey);
        if (catalog?.TryFind(runnerKey) is not { } definition)
        {
            return primary;
        }

        var outputKeys = definition.OutputParamDefs
            .Select(static o => (o.Key ?? string.Empty).Trim())
            .Where(static k => k.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (outputKeys.Count == 0
            || outputKeys.Contains(primary, StringComparer.OrdinalIgnoreCase))
        {
            return primary;
        }

        var varText = boundValue.Type == JTokenType.String
            && boundValue.Value<string>() is { } text
            && text.Trim() is { Length: > 0 } trimmed
            && !trimmed.Contains('\n', StringComparison.Ordinal)
                ? trimmed
                : "yourVar";
        var example = outputKeys.FirstOrDefault(
                static k => !string.Equals(k, "isSuccess", StringComparison.OrdinalIgnoreCase))
            ?? outputKeys[0];
        throw new ProgramSourceException(
            ProgramSourceCodes.NoPrimaryOutput,
            $"Step '{runnerKey}' has no primary output (its catalog card shows no # >>), so >> would bind "
            + $"the nonexistent output '{primary}' and never set the variable. "
            + $"Outputs: {string.Join(", ", outputKeys)}. "
            + $"Map the one you need with outputs instead, e.g. outputs: {{ {example}: {varText} }}."
            + ProgramSourceLocations.FormatStepContext(sourceStep, string.Empty));
    }
}
