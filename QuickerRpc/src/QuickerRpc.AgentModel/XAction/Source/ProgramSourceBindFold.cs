// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// Fold CAW <c>param.var</c>/<c>param.file</c> into source maps, and expand back.
/// </summary>
public static class ProgramSourceBindFold
{
    private static readonly HashSet<string> ValueFormKeys = new(StringComparer.Ordinal)
    {
        "var",
        "file",
        "lit",
        "expr",
        "interp",
    };

    public static void FoldInputsInPlace(JObject root)
    {
        FoldSteps(root["steps"] as JArray);
        if (root["subPrograms"] is JArray subs)
        {
            foreach (var sp in subs.OfType<JObject>())
            {
                FoldInputsInPlace(sp);
            }
        }
    }

    public static void UnfoldInputsInPlace(JObject root)
    {
        UnfoldSteps(root["steps"] as JArray);
        if (root["subPrograms"] is JArray subs)
        {
            foreach (var sp in subs.OfType<JObject>())
            {
                UnfoldInputsInPlace(sp);
            }
        }
    }

    private static void FoldSteps(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        foreach (var step in steps.OfType<JObject>())
        {
            if (step["inputs"] is JObject inputs)
            {
                step["inputs"] = FoldMap(inputs);
            }

            FoldSteps(step["ifSteps"] as JArray);
            FoldSteps(step["elseSteps"] as JArray);
        }
    }

    private static void UnfoldSteps(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        foreach (var step in steps.OfType<JObject>())
        {
            if (step["inputs"] is JObject inputs)
            {
                step["inputs"] = UnfoldMap(inputs, ProgramSourceSubProgramIoFold.IsSubProgramStep(step));
            }

            UnfoldSteps(step["ifSteps"] as JArray);
            UnfoldSteps(step["elseSteps"] as JArray);
        }
    }

    private static JObject FoldMap(JObject inputs)
    {
        // 字面量任意层级看起来像绑定时，显式包裹 lit，保证已有 CAW 数据能够往返。
        var protectedInputs = new JObject();
        foreach (var prop in inputs.Properties())
        {
            if (!prop.Name.EndsWith(".var", StringComparison.Ordinal)
                && !prop.Name.EndsWith(".file", StringComparison.Ordinal)
                && ContainsValueForm(prop.Value))
            {
                protectedInputs[prop.Name] = new JObject { ["lit"] = prop.Value.DeepClone() };
            }
            else
            {
                protectedInputs[prop.Name] = prop.Value.DeepClone();
            }
        }

        var bases = new Dictionary<string, BindPresence>(StringComparer.Ordinal);
        foreach (var prop in protectedInputs.Properties())
        {
            var name = prop.Name;
            if (name.EndsWith(".var", StringComparison.Ordinal))
            {
                var b = name.Substring(0, name.Length - 4);
                Get(bases, b).HasVar = true;
                Get(bases, b).VarValue = prop.Value;
            }
            else if (name.EndsWith(".file", StringComparison.Ordinal))
            {
                var b = name.Substring(0, name.Length - 5);
                Get(bases, b).HasFile = true;
                Get(bases, b).FileValue = prop.Value;
            }
            else
            {
                Get(bases, name).HasLiteral = true;
                Get(bases, name).LiteralValue = prop.Value;
            }
        }

        var result = new JObject();
        foreach (var key in bases.Keys.OrderBy(k => k, StringComparer.Ordinal))
        {
            var p = bases[key];
            var modes = (p.HasLiteral ? 1 : 0) + (p.HasVar ? 1 : 0) + (p.HasFile ? 1 : 0);
            if (modes > 1)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.MixedBind,
                    $"Mixed binds for input '{key}'.");
            }

            if (p.HasVar && !p.HasLiteral && !p.HasFile)
            {
                result[key] = new JObject { ["var"] = p.VarValue!.DeepClone() };
            }
            else if (p.HasFile && !p.HasLiteral && !p.HasVar)
            {
                result[key] = new JObject { ["file"] = p.FileValue!.DeepClone() };
            }
            else if (p.HasLiteral)
            {
                result[key] = p.LiteralValue!.DeepClone();
            }
        }

        return result;
    }

    private static JObject UnfoldMap(JObject inputs, bool allowLegacyInputBag = false)
    {
        var result = new JObject();
        foreach (var prop in inputs.Properties())
        {
            // 子程序旧 in 容器是参数表，不是对象快照；保留其顶层绑定读法。
            if (allowLegacyInputBag && prop.Name == "in" && prop.Value is JObject bag)
            {
                result[prop.Name] = UnfoldMap(bag);
            }
            else if (prop.Value is JObject map && IsValueForm(map))
            {
                ExpandValueForm(result, prop.Name, map);
            }
            else
            {
                RejectNestedBinds(prop.Value, prop.Name);
                result[prop.Name] = prop.Value.DeepClone();
            }
        }

        return result;
    }

    /// <summary>
    /// A <c>{var|file|expr|interp|lit}</c> object is a bind only when it is the whole parameter.
    /// The same shape nested inside a snapshot is stored as data and is not evaluated.
    /// An explicit <c>lit</c> payload is intentional data at every depth.
    /// </summary>
    private static void RejectNestedBinds(JToken token, string path)
    {
        if (token is JObject obj && IsValueForm(obj))
        {
            var kind = obj.Properties().First().Name;
            throw new ProgramSourceException(
                ProgramSourceCodes.NestedBind,
                $"Input '{path}' nests a {kind} bind inside an object or array. "
                + "A bind applies only to the whole parameter. "
                + "Build the object with $= (for example $=new { before = {beforeCode} }), "
                + "or bind the whole parameter with var:. Use lit: around the whole parameter for literal data.");
        }

        if (token is JObject map)
        {
            foreach (var prop in map.Properties())
            {
                RejectNestedBinds(prop.Value, path + "." + prop.Name);
            }

            return;
        }

        if (token is JArray array)
        {
            for (var i = 0; i < array.Count; i++)
            {
                RejectNestedBinds(array[i]!, path + "[" + i + "]");
            }
        }
    }

    private static bool ContainsValueForm(JToken token) => token switch
    {
        JObject map => IsValueForm(map) || map.Properties().Any(prop => ContainsValueForm(prop.Value)),
        JArray array => array.Any(ContainsValueForm),
        _ => false,
    };

    private static bool IsValueForm(JObject map)
    {
        if (map.Count == 0 || map.Count > 2)
        {
            return false;
        }

        return map.Properties().All(p => ValueFormKeys.Contains(p.Name));
    }

    private static void ExpandValueForm(JObject result, string baseName, JObject map)
    {
        if (map["var"] is not null)
        {
            if (map.Count != 1)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.MixedBind,
                    $"Invalid var form for '{baseName}'.");
            }

            result[baseName + ".var"] = map["var"]!.DeepClone();
            return;
        }

        if (map["file"] is not null)
        {
            if (map.Count != 1)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.MixedBind,
                    $"Invalid file form for '{baseName}'.");
            }

            result[baseName + ".file"] = map["file"]!.DeepClone();
            return;
        }

        if (map["lit"] is not null)
        {
            if (map.Count != 1)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.MixedBind,
                    $"Invalid lit form for '{baseName}'.");
            }

            // Object/array lit wraps CAW literals that look like value-form sugar.
            if (map["lit"]!.Type == JTokenType.String)
            {
                var lit = map.Value<string>("lit") ?? string.Empty;
                if (lit.StartsWith("$=", StringComparison.Ordinal)
                    || lit.StartsWith("$$", StringComparison.Ordinal))
                {
                    throw new ProgramSourceException(
                        ProgramSourceCodes.LitDollarPrefix,
                        $"lit for '{baseName}' must not start with $= or $$; use file: or expr/interp.");
                }
            }

            result[baseName] = map["lit"]!.DeepClone();
            return;
        }

        if (map["expr"] is not null)
        {
            if (map.Count != 1 || map["expr"]!.Type != JTokenType.String)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.CawInvalid,
                    $"Invalid expr form for '{baseName}'.");
            }

            result[baseName] = "$=" + map.Value<string>("expr");
            return;
        }

        if (map["interp"] is not null)
        {
            if (map.Count != 1 || map["interp"]!.Type != JTokenType.String)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.CawInvalid,
                    $"Invalid interp form for '{baseName}'.");
            }

            result[baseName] = "$$" + map.Value<string>("interp");
            return;
        }

        throw new ProgramSourceException(
            ProgramSourceCodes.UnknownSugar,
            $"Unknown value form for '{baseName}'.");
    }

    private static BindPresence Get(Dictionary<string, BindPresence> map, string key)
    {
        if (!map.TryGetValue(key, out var p))
        {
            p = new BindPresence();
            map[key] = p;
        }

        return p;
    }

    private sealed class BindPresence
    {
        public bool HasLiteral;
        public bool HasVar;
        public bool HasFile;
        public JToken? LiteralValue;
        public JToken? VarValue;
        public JToken? FileValue;
    }
}
