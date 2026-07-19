using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Proto;

/// <summary>
/// Agent step wire aliases: short disk form (<c>key</c>/<c>inputs</c>/<c>outputs</c>)
/// ↔ internal legacy (<c>stepRunnerKey</c>/<c>inputParams</c>/<c>outputParams</c>).
/// </summary>
public static class AgentStepWireAliases
{
    public static void ToLegacySteps(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        foreach (var token in steps)
        {
            if (token is JObject step)
            {
                ToLegacy(step);
            }
        }
    }

    public static void ToShortSteps(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        foreach (var token in steps)
        {
            if (token is JObject step)
            {
                ToShort(step);
            }
        }
    }

    /// <summary>
    /// Prefer existing legacy keys; otherwise promote short aliases. Removes short keys.
    /// Recurses into <c>ifSteps</c>/<c>elseSteps</c>.
    /// </summary>
    public static void ToLegacy(JObject step)
    {
        PreferTarget(step, preferred: "stepRunnerKey", alias: "key");
        PreferTarget(step, preferred: "stepRunnerKey", alias: "Key");
        PreferTarget(step, preferred: "inputParams", alias: "inputs");
        PreferTarget(step, preferred: "inputParams", alias: "Inputs");
        PreferTarget(step, preferred: "outputParams", alias: "outputs");
        PreferTarget(step, preferred: "outputParams", alias: "Outputs");

        ToLegacySteps(step["ifSteps"] as JArray);
        ToLegacySteps(step["IfSteps"] as JArray);
        ToLegacySteps(step["elseSteps"] as JArray);
        ToLegacySteps(step["ElseSteps"] as JArray);
    }

    /// <summary>
    /// Emit short Agent wire names; removes legacy step identity / param map keys.
    /// Recurses into <c>ifSteps</c>/<c>elseSteps</c>.
    /// </summary>
    public static void ToShort(JObject step)
    {
        PreferTarget(step, preferred: "key", alias: "stepRunnerKey");
        PreferTarget(step, preferred: "key", alias: "StepRunnerKey");
        PreferTarget(step, preferred: "inputs", alias: "inputParams");
        PreferTarget(step, preferred: "inputs", alias: "InputParams");
        PreferTarget(step, preferred: "outputs", alias: "outputParams");
        PreferTarget(step, preferred: "outputs", alias: "OutputParams");

        ToShortSteps(step["ifSteps"] as JArray);
        ToShortSteps(step["IfSteps"] as JArray);
        ToShortSteps(step["elseSteps"] as JArray);
        ToShortSteps(step["ElseSteps"] as JArray);
    }

    /// <summary>
    /// Keep <paramref name="preferred"/> if it has a usable value; else copy from <paramref name="alias"/>.
    /// Always remove <paramref name="alias"/>.
    /// </summary>
    private static void PreferTarget(JObject step, string preferred, string alias)
    {
        var aliasProp = step.Property(alias);
        if (aliasProp is null)
        {
            return;
        }

        if (IsAbsent(step[preferred]) && !IsAbsent(aliasProp.Value))
        {
            step[preferred] = aliasProp.Value;
        }

        step.Remove(alias);
    }

    private static bool IsAbsent(JToken? token)
    {
        if (token is null
            || token.Type is JTokenType.Null or JTokenType.Undefined)
        {
            return true;
        }

        return token.Type == JTokenType.String
            && string.IsNullOrWhiteSpace(token.Value<string>());
    }

    /// <summary>Read runner key from disk wire without requiring <see cref="ToLegacy"/> first.</summary>
    public static string ReadRunnerKey(JObject step) =>
        step["stepRunnerKey"]?.ToString()
        ?? step["StepRunnerKey"]?.ToString()
        ?? step["key"]?.ToString()
        ?? step["Key"]?.ToString()
        ?? string.Empty;

    /// <summary>Read compact or legacy input map without expand.</summary>
    public static JObject? ReadInputMap(JObject step) =>
        step["inputParams"] as JObject
        ?? step["InputParams"] as JObject
        ?? step["inputs"] as JObject
        ?? step["Inputs"] as JObject;

    /// <summary>Wire segment for StepPath hints: <c>inputs</c> vs <c>inputParams</c>.</summary>
    public static string InputMapWireSegment(JObject step) =>
        step["inputs"] is JObject || step["Inputs"] is JObject
            ? "inputs"
            : "inputParams";

    /// <summary>Read compact or legacy output map without expand.</summary>
    public static JObject? ReadOutputMap(JObject step) =>
        step["outputParams"] as JObject
        ?? step["OutputParams"] as JObject
        ?? step["outputs"] as JObject
        ?? step["Outputs"] as JObject;

    /// <summary>Wire segment for StepPath hints: <c>outputs</c> vs <c>outputParams</c>.</summary>
    public static string OutputMapWireSegment(JObject step) =>
        step["outputs"] is JObject || step["Outputs"] is JObject
            ? "outputs"
            : "outputParams";
}
