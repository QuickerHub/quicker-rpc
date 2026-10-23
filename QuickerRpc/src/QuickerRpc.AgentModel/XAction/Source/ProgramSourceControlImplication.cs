// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// Branches of one <c>SourceImplied</c> control field: every visible control value with the gated
/// params it shows. Params visible under every value are not listed (they never constrain).
/// </summary>
public sealed class ControlBranchTable
{
    public ControlBranchTable(
        string runnerKey,
        string controlKey,
        string defaultValue,
        IReadOnlyDictionary<string, ISet<string>> branches,
        IReadOnlyDictionary<string, string> ownerBranch)
    {
        RunnerKey = runnerKey;
        ControlKey = controlKey;
        DefaultValue = defaultValue;
        Branches = branches;
        OwnerBranch = ownerBranch;
        GatedParams = branches.Values
            .SelectMany(static p => p)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    public string RunnerKey { get; }

    public string ControlKey { get; }

    public string DefaultValue { get; }

    /// <summary>Control value → gated params visible under it (wire keys, case-insensitive).</summary>
    public IReadOnlyDictionary<string, ISet<string>> Branches { get; }

    /// <summary>Shared param → the branch it belongs to (<c>InputParamAttribute.OwnerBranch</c>).</summary>
    public IReadOnlyDictionary<string, string> OwnerBranch { get; }

    /// <summary>Params that appear in at least one branch but not in all of them.</summary>
    public ISet<string> GatedParams { get; }

    /// <summary>Control values in declaration order.</summary>
    public IReadOnlyList<string> Values => Branches.Keys.ToList();
}

public enum ImplyKind
{
    /// <summary>No gated param bound, or shared params only with no owner: the control default applies.</summary>
    None,

    /// <summary>Exactly one branch fits the bound params.</summary>
    Value,

    /// <summary>The bound params belong to different branches.</summary>
    Conflict,
}

public readonly struct ImplyResult
{
    public ImplyResult(ImplyKind kind, string? value, IReadOnlyList<string> parameters) { Kind = kind; Value = value; Params = parameters; }
    public ImplyKind Kind { get; }
    public string? Value { get; }
    public IReadOnlyList<string> Params { get; }
    public static ImplyResult None() => new(ImplyKind.None, null, Array.Empty<string>());
}

/// <summary>
/// Program-source sugar: a <c>SourceImplied</c> control field may be omitted; its value follows the
/// branch of the bound params. One pure function (<see cref="Imply"/>) drives decode, canonical
/// encode, CAW materialization, catalog leaf cards and the hidden-param lint, so the mapping stays
/// bijective. The codec has no catalog, so opted-in runners are listed in a static table that
/// <c>Quicker.StepV2Test</c> checks against the real runner attributes.
/// </summary>
public static class ProgramSourceControlImplication
{
    private static readonly Dictionary<string, ControlBranchTable> Tables = new(StringComparer.OrdinalIgnoreCase)
    {
        ["sys:writeClipboard"] = Table(
            "sys:writeClipboard",
            "type",
            "auto",
            new (string Value, string[] Params)[]
            {
                ("auto", ["input"]),
                ("html", ["html", "text"]),
                ("text", ["text"]),
                ("image", ["imageVar", "fastMode"]),
                ("rtf", ["text"]),
                ("csv", ["text"]),
                ("custom", ["customFormat", "text"]),
                ("clear", []),
                ("clearHistory", []),
            },
            new (string Param, string Branch)[] { ("text", "text") }),
    };

    /// <summary>Opted-in runners known to the codec (fallback when no catalog is loaded).</summary>
    public static IReadOnlyCollection<ControlBranchTable> All => Tables.Values;

    public static ControlBranchTable? TryGet(string? runnerKey) =>
        !string.IsNullOrWhiteSpace(runnerKey) && Tables.TryGetValue(runnerKey.Trim(), out var table) ? table : null;

    /// <summary>
    /// Branch implied by the bound params: the single branch that shows all of them; among several,
    /// the one a bound shared param belongs to; none when nothing gated is bound.
    /// </summary>
    public static ImplyResult Imply(ControlBranchTable table, IEnumerable<string> boundParams)
    {
        if (table is null) throw new ArgumentNullException(nameof(table));
        var gated = boundParams
            .Where(p => table.GatedParams.Contains(p))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (gated.Count == 0)
        {
            return ImplyResult.None();
        }

        var fitting = table.Branches
            .Where(b => gated.All(p => b.Value.Contains(p)))
            .Select(static b => b.Key)
            .ToList();
        if (fitting.Count == 0)
        {
            return new ImplyResult(ImplyKind.Conflict, null, gated);
        }

        if (fitting.Count == 1)
        {
            return new ImplyResult(ImplyKind.Value, fitting[0], gated);
        }

        var owners = gated
            .Select(p => table.OwnerBranch.TryGetValue(p, out var owner) ? owner : null)
            .Where(owner => owner is not null && fitting.Contains(owner, StringComparer.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        return owners.Count switch
        {
            1 => new ImplyResult(ImplyKind.Value, owners[0]!, gated),
            0 => ImplyResult.None(),
            _ => new ImplyResult(ImplyKind.Conflict, null, gated),
        };
    }

    /// <summary>Value the control takes when omitted; null when the params conflict.</summary>
    public static string? ImpliedOrDefault(ControlBranchTable table, IEnumerable<string> boundParams)
    {
        var result = Imply(table, boundParams);
        return result.Kind switch
        {
            ImplyKind.Value => result.Value,
            ImplyKind.None => table.DefaultValue,
            _ => null,
        };
    }

    /// <summary>
    /// Canonical encode may drop the control iff its literal equals what the other bound params imply.
    /// </summary>
    public static bool CanOmit(ControlBranchTable table, JObject inputs)
    {
        var literal = ReadControlLiteral(inputs, table.ControlKey);
        if (literal is null)
        {
            return false;
        }

        var expected = ImpliedOrDefault(table, BoundParamKeys(inputs, table.ControlKey));
        return expected is not null && string.Equals(expected, literal, StringComparison.Ordinal);
    }

    /// <summary>
    /// CAW canonical form keeps the control explicit: fill it from the bound params (or the default)
    /// when omitted. Conflicting params are left for decode / validate to report.
    /// <paramref name="expanded"/> writes <c>{ "value": v }</c> (native-ish maps), else a scalar.
    /// </summary>
    public static void MaterializeInputsInPlace(ControlBranchTable table, JObject inputs, bool expanded)
    {
        if (table is null) throw new ArgumentNullException(nameof(table));
        if (inputs is null) throw new ArgumentNullException(nameof(inputs));
        if (HasControl(inputs, table.ControlKey))
        {
            return;
        }

        var value = ImpliedOrDefault(table, BoundParamKeys(inputs, table.ControlKey));
        if (value is null)
        {
            return;
        }

        inputs[table.ControlKey] = expanded ? new JObject { ["value"] = value } : JValue.CreateString(value);
    }

    /// <summary>Compact CAW step (<c>key</c> + <c>inputs</c>); creates <c>inputs</c> for a bare step.</summary>
    public static void MaterializeStepInPlace(JObject step)
    {
        if (step is null) throw new ArgumentNullException(nameof(step));
        var table = TryGet(AgentStepWireAliases.ReadRunnerKey(step));
        if (table is null)
        {
            return;
        }

        if (step["inputs"] is not JObject inputs)
        {
            inputs = new JObject();
            step["inputs"] = inputs;
        }

        MaterializeInputsInPlace(table, inputs, expanded: false);
    }

    public static void MaterializeStepsRecursive(JObject root)
    {
        MaterializeSteps(root["steps"] as JArray);
        if (root["subPrograms"] is not JArray subs)
        {
            return;
        }

        foreach (var sp in subs.OfType<JObject>())
        {
            MaterializeStepsRecursive(sp);
        }
    }

    private static void MaterializeSteps(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        foreach (var step in steps.OfType<JObject>())
        {
            MaterializeStepInPlace(step);
            MaterializeSteps(step["ifSteps"] as JArray);
            MaterializeSteps(step["elseSteps"] as JArray);
        }
    }

    /// <summary>
    /// Decode: an omitted control whose bound params belong to different branches is not a valid
    /// program (<c>branch_conflict</c>); reported with the source location.
    /// </summary>
    public static void RequireConsistentBranchesRecursive(JObject root, string path = "steps")
    {
        RequireConsistentSteps(root["steps"] as JArray, path);
        if (root["subPrograms"] is not JArray subs)
        {
            return;
        }

        for (var i = 0; i < subs.Count; i++)
        {
            if (subs[i] is JObject sp)
            {
                RequireConsistentBranchesRecursive(sp, $"subPrograms[{i}].steps");
            }
        }
    }

    private static void RequireConsistentSteps(JArray? steps, string path)
    {
        if (steps is null)
        {
            return;
        }

        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            var itemPath = $"{path}[{i}]";
            var table = TryGet(AgentStepWireAliases.ReadRunnerKey(step));
            if (table is not null
                && step["inputs"] is JObject inputs
                && !HasControl(inputs, table.ControlKey))
            {
                var result = Imply(table, BoundParamKeys(inputs, table.ControlKey));
                if (result.Kind == ImplyKind.Conflict)
                {
                    throw new ProgramSourceException(
                        ProgramSourceCodes.BranchConflict,
                        $"Step '{table.RunnerKey}': {string.Join(", ", result.Params)} belong to different {table.ControlKey} branches; set {table.ControlKey} explicitly."
                        + ProgramSourceLocations.FormatStepContext(step, itemPath));
                }
            }

            RequireConsistentSteps(step["ifSteps"] as JArray, itemPath + ".ifSteps");
            RequireConsistentSteps(step["elseSteps"] as JArray, itemPath + ".elseSteps");
        }
    }

    /// <summary>Control present in any form (literal, variable, file, expanded object).</summary>
    public static bool HasControl(JObject inputs, string controlKey) =>
        inputs.Properties().Any(prop =>
            string.Equals(BaseKey(prop.Name), controlKey, StringComparison.OrdinalIgnoreCase)
            && IsBound(prop.Value));

    /// <summary>
    /// Literal control value (scalar, <c>{lit}</c> or expanded <c>{value}</c>); null when omitted or
    /// bound to a variable / file.
    /// </summary>
    public static string? ReadControlLiteral(JObject inputs, string controlKey)
    {
        string? literal = null;
        foreach (var prop in inputs.Properties())
        {
            if (!string.Equals(BaseKey(prop.Name), controlKey, StringComparison.OrdinalIgnoreCase)
                || !IsBound(prop.Value))
            {
                continue;
            }

            if (!string.Equals(prop.Name, controlKey, StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            switch (prop.Value)
            {
                case JValue { Type: JTokenType.String } scalar:
                    literal = (scalar.Value<string>() ?? string.Empty).Trim();
                    break;
                case JObject obj when obj["var"] is not null || obj["file"] is not null
                                      || ReadNonEmpty(obj, "varKey", "VarKey") is not null
                                      || ReadNonEmpty(obj, "file", "File") is not null:
                    return null;
                case JObject obj:
                    literal = ReadNonEmpty(obj, "lit", "value", "Value");
                    break;
                default:
                    return null;
            }
        }

        return string.IsNullOrEmpty(literal) ? null : literal;
    }

    /// <summary>Base keys of every bound input except <paramref name="excludeKey"/>, in any wire form.</summary>
    public static List<string> BoundParamKeys(JObject inputs, string excludeKey)
    {
        var keys = new List<string>();
        foreach (var prop in inputs.Properties())
        {
            var baseKey = BaseKey(prop.Name);
            if (baseKey.Length == 0
                || string.Equals(baseKey, excludeKey, StringComparison.OrdinalIgnoreCase)
                || !IsBound(prop.Value))
            {
                continue;
            }

            if (!keys.Contains(baseKey, StringComparer.OrdinalIgnoreCase))
            {
                keys.Add(baseKey);
            }
        }

        return keys;
    }

    private static string BaseKey(string wireKey) =>
        InputParamWireCoercer.ParseWireParamKey(wireKey).BaseKey.Trim();

    /// <summary>
    /// Bound = the param is explicitly present in any wire shape (compact scalar / <c>.var</c> /
    /// <c>.file</c>, folded <c>{var|file|lit|expr|interp}</c>, expanded <c>{value|varKey|file}</c>).
    /// An empty or whitespace string literal still counts: <c>text: ""</c> is the text branch, not
    /// an omitted param that would fall back to <c>type=auto</c>.
    /// </summary>
    private static bool IsBound(JToken? token)
    {
        switch (token)
        {
            case null:
                return false;
            case JValue value:
                return value.Type is not (JTokenType.Null or JTokenType.Undefined);
            case JArray array:
                return array.Count > 0;
            case JObject obj:
                var bindKeys = new[] { "var", "file", "lit", "expr", "interp", "value", "Value", "varKey", "VarKey", "File" };
                var isBindForm = bindKeys.Any(k => obj[k] is not null);
                if (!isBindForm)
                {
                    return obj.Count > 0;
                }

                return bindKeys.Any(k => IsBound(obj[k]));
            default:
                return false;
        }
    }

    private static string? ReadNonEmpty(JObject obj, params string[] names)
    {
        foreach (var name in names)
        {
            var token = obj[name];
            if (token is JValue { Type: JTokenType.String } s && !string.IsNullOrWhiteSpace(s.Value<string>()))
            {
                return s.Value<string>()!.Trim();
            }

            if (token is JValue { Type: JTokenType.Integer or JTokenType.Float or JTokenType.Boolean } v)
            {
                return v.ToString();
            }
        }

        return null;
    }

    private static ControlBranchTable Table(
        string runnerKey,
        string controlKey,
        string defaultValue,
        (string Value, string[] Params)[] branches,
        (string Param, string Branch)[] owners)
    {
        var branchMap = new Dictionary<string, ISet<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var (value, parameters) in branches)
        {
            branchMap[value] = parameters.ToHashSet(StringComparer.OrdinalIgnoreCase);
        }

        // Params visible under every value never constrain the branch; drop them so declaration
        // order of "common" fields cannot leak into the table.
        var all = branchMap.Values.SelectMany(static p => p).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var common = all.Where(p => branchMap.Values.All(set => set.Contains(p))).ToList();
        if (common.Count > 0 && branchMap.Count > 1)
        {
            foreach (var key in branchMap.Keys.ToList())
            {
                branchMap[key] = branchMap[key].Where(p => !common.Contains(p, StringComparer.OrdinalIgnoreCase))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
            }
        }

        var ownerMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (param, branch) in owners)
        {
            ownerMap[param] = branch;
        }

        return new ControlBranchTable(runnerKey, controlKey, defaultValue, branchMap, ownerMap);
    }
}
