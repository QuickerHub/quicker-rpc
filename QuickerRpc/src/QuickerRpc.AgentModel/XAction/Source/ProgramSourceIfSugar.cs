// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// S1 control-flow sugar: <c>if</c> / <c>else if</c> ↔ <c>sys:if</c> + ifSteps/elseSteps.
/// </summary>
public static class ProgramSourceIfSugar
{
    private const string IfRunnerKey = "sys:if";

    public static void DesugarInPlace(JObject root)
    {
        if (root["steps"] is JArray steps)
        {
            DesugarSteps(steps);
        }

        if (root["subPrograms"] is JArray subs)
        {
            foreach (var sp in subs.OfType<JObject>())
            {
                DesugarInPlace(sp);
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

    private static void DesugarSteps(JArray steps)
    {
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            if (IsIfSugarStep(step))
            {
                steps[i] = DesugarIfNode(step);
                step = (JObject)steps[i]!;
            }
            else
            {
                RejectStraySugarKeys(step);
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                DesugarSteps(ifSteps);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                DesugarSteps(elseSteps);
            }
        }
    }

    private static bool IsIfSugarStep(JObject step) =>
        step["if"] is not null
        && step["key"] is null
        && step.Properties().All(p => p.Name == "if");

    private static JObject DesugarIfNode(JObject step)
    {
        // Sugar step should not also carry wire identity.
        if (step["key"] is not null)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.UnknownSugar,
                "if-sugar step must not also set key.");
        }

        foreach (var name in step.Properties().Select(p => p.Name).ToList())
        {
            if (name is not "if")
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.UnknownSugar,
                    $"Unexpected property '{name}' on if-sugar step.");
            }
        }

        if (step["if"] is JValue { Type: JTokenType.String or JTokenType.Integer or JTokenType.Float or JTokenType.Boolean } scalar)
        {
            // Primary-input scalar (attr IsSourcePrimary on sys:if.condition): omit mapping wrapper / then.
            return DesugarIfBody(new JObject
            {
                ["condition"] = scalar.DeepClone(),
                ["then"] = new JArray(),
            });
        }

        if (step["if"] is not JObject ifBody)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.UnknownSugar,
                "if-sugar requires a mapping value or a primary condition scalar.");
        }

        return DesugarIfBody(ifBody);
    }

    private static JObject DesugarIfBody(JObject ifBody)
    {
        if (ifBody["condition"] is null || ifBody["condition"]!.Type == JTokenType.Null)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.CawInvalid,
                "if-sugar requires condition.");
        }

        if (ifBody["condition"]!.Type == JTokenType.String
            && string.IsNullOrWhiteSpace(ifBody.Value<string>("condition")))
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.CawInvalid,
                "if-sugar condition must not be empty.");
        }

        var thenToken = ifBody["then"];
        JArray thenSteps;
        if (thenToken is null)
        {
            thenSteps = new JArray();
        }
        else if (thenToken is JArray thenArray)
        {
            thenSteps = thenArray;
        }
        else
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.UnknownSugar,
                "then must be a step list.");
        }

        DesugarSteps(thenSteps);

        JArray? elseSteps = null;
        if (ifBody["else if"] is JObject elseIfBody)
        {
            if (ifBody["else"] is not null)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.UnknownSugar,
                    "if-sugar cannot set both else if and else.");
            }

            elseSteps = new JArray { DesugarIfBody(elseIfBody) };
        }
        else if (ifBody["else if"] is not null)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.UnknownSugar,
                "else if must be a mapping.");
        }
        else if (ifBody["else"] is JArray elseArray)
        {
            DesugarSteps(elseArray);
            elseSteps = elseArray;
        }
        else if (ifBody["else"] is not null)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.UnknownSugar,
                "else must be a step list.");
        }

        foreach (var prop in ifBody.Properties())
        {
            if (prop.Name is not "condition" and not "then" and not "else" and not "else if")
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.UnknownSugar,
                    $"Unexpected if-sugar field '{prop.Name}'.");
            }
        }

        var result = new JObject
        {
            ["key"] = IfRunnerKey,
            ["inputs"] = new JObject
            {
                ["condition"] = ExpandCondition(ifBody["condition"]!),
            },
            ["ifSteps"] = thenSteps,
        };

        if (elseSteps is { Count: > 0 })
        {
            result["elseSteps"] = elseSteps;
        }

        return result;
    }

    private static JToken ExpandCondition(JToken condition)
    {
        if (condition is JObject map && map.Count == 1)
        {
            if (map["var"] is not null)
            {
                // Rare; condition as whole-variable bind — keep as object for later unfold? Wire wants string or we use .var on inputs.
                // Prefer expanding known value forms into condition string / leave for Unfold on inputs only.
                // Put into inputs after: support expr/interp/lit here.
            }

            if (map["expr"]?.Type == JTokenType.String)
            {
                return "$=" + map.Value<string>("expr");
            }

            if (map["interp"]?.Type == JTokenType.String)
            {
                return "$$" + map.Value<string>("interp");
            }

            if (map["lit"] is not null)
            {
                var lit = map["lit"]!.Type == JTokenType.String
                    ? map.Value<string>("lit") ?? string.Empty
                    : map["lit"]!.ToString();
                if (lit.StartsWith("$=", StringComparison.Ordinal)
                    || lit.StartsWith("$$", StringComparison.Ordinal))
                {
                    throw new ProgramSourceException(
                        ProgramSourceCodes.LitDollarPrefix,
                        "condition lit must not start with $= or $$.");
                }

                return map["lit"]!.DeepClone();
            }

            if (map["file"] is not null || map["var"] is not null)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.UnknownSugar,
                    "condition does not support var/file forms; use string or expr/interp/lit.");
            }
        }

        return condition.DeepClone();
    }

    private static void RejectStraySugarKeys(JObject step)
    {
        if (step["else if"] is not null || step["then"] is not null)
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.UnknownSugar,
                "then/else if are only valid under if-sugar.");
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

            if (TryResugar(step, out var sugared))
            {
                steps[i] = sugared;
            }
        }
    }

    private static bool TryResugar(JObject step, out JObject sugared)
    {
        sugared = step;
        if (!CanResugarSysIf(step))
        {
            return false;
        }

        var body = BuildIfBody(step);
        // Empty then/else + string condition → primary scalar (IsSourcePrimary on condition).
        if (body["then"] is JArray { Count: 0 }
            && body["else"] is null
            && body["else if"] is null
            && body["condition"] is JValue { Type: JTokenType.String } cond
            && !string.IsNullOrWhiteSpace(cond.Value<string>()))
        {
            sugared = new JObject { ["if"] = cond.DeepClone() };
            return true;
        }

        sugared = new JObject { ["if"] = body };
        return true;
    }

    private static bool CanResugarSysIf(JObject step)
    {
        if (!string.Equals(step.Value<string>("key"), IfRunnerKey, StringComparison.Ordinal))
        {
            return false;
        }

        // Only allow known CAW fields; unknown keys (e.g. vendorMeta) stay S0.
        foreach (var prop in step.Properties())
        {
            if (prop.Name is not "key" and not "inputs" and not "ifSteps" and not "elseSteps")
            {
                return false;
            }
        }

        if (step["inputs"] is not JObject inputs)
        {
            return false;
        }

        // After fold: only condition (string or already folded forms — we fold before resugar).
        if (inputs.Count != 1 || inputs["condition"] is null)
        {
            // Also allow unfolded condition-only with no other keys.
            if (inputs.Count != 1)
            {
                return false;
            }
        }

        // Reject if any input key other than condition / condition.*
        foreach (var prop in inputs.Properties())
        {
            if (prop.Name is not "condition"
                && !prop.Name.StartsWith("condition.", StringComparison.Ordinal))
            {
                return false;
            }
        }

        // Folded form: condition as scalar only for resugar (not {var}/{file}).
        if (inputs["condition"] is JObject)
        {
            return false;
        }

        return inputs["condition"] is not null;
    }

    private static JObject BuildIfBody(JObject step)
    {
        var inputs = (JObject)step["inputs"]!;
        var body = new JObject
        {
            ["condition"] = inputs["condition"]!.DeepClone(),
            ["then"] = step["ifSteps"] is JArray thenArr
                ? thenArr.DeepClone()
                : new JArray(),
        };

        if (step["elseSteps"] is JArray { Count: > 0 } elseSteps)
        {
            if (elseSteps.Count == 1
                && elseSteps[0] is JObject only
                && CanResugarSysIf(only))
            {
                // Nested sys:if already resugared in place? ResugarSteps does children first,
                // so only may already be { if: {...} }.
                if (only["if"] is JObject nestedIf)
                {
                    body["else if"] = nestedIf.DeepClone();
                }
                else
                {
                    body["else if"] = BuildIfBody(only);
                }
            }
            else if (elseSteps.Count == 1
                     && elseSteps[0] is JObject sugaredElse
                     && sugaredElse["if"] is JObject nested)
            {
                body["else if"] = nested.DeepClone();
            }
            else
            {
                body["else"] = elseSteps.DeepClone();
            }
        }

        return body;
    }
}
