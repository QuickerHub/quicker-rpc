using System.Linq;
using System.Text;
using Quicker.ActionRuntime.Abstractions.Models;



namespace QuickerRpc.Console.ActionRuntime;



/// <summary>Readable C# preview generated from compiled ActionRuntime program JSON.</summary>

internal static class ActionRuntimeProgramCsEmitter

{

    internal static string Emit(XAction program, string? actionTitle = null)

    {

        var sb = new StringBuilder();

        sb.AppendLine("// ActionRuntime preview — generated from compiled program JSON");

        if (!string.IsNullOrWhiteSpace(actionTitle))

        {

            sb.AppendLine($"// {actionTitle.Trim()}");

        }



        sb.AppendLine();

        sb.AppendLine("void Execute(IRuntimeContext ctx)");

        sb.AppendLine("{");



        if (program.Variables.Count > 0)

        {

            sb.AppendLine("    // variables (defaults applied by runtime)");

            foreach (var variable in program.Variables)

            {

                if (string.IsNullOrWhiteSpace(variable.DefaultValue))

                {

                    sb.AppendLine($"    // {variable.Key}");

                    continue;

                }



                sb.AppendLine(

                    $"    ctx.SetVar({Literal(variable.Key)}, {Literal(variable.DefaultValue)});");

            }



            sb.AppendLine();

        }



        EmitSteps(sb, program.Steps, "    ");

        sb.AppendLine("}");

        return sb.ToString().TrimEnd();

    }



    private static void EmitSteps(StringBuilder sb, IList<ActionStep> steps, string indent)

    {

        for (var i = 0; i < steps.Count; i++)

        {

            EmitStep(sb, steps[i], indent, i);

        }

    }



    private static void EmitStep(StringBuilder sb, ActionStep step, string indent, int index)

    {

        if (step.Disabled)

        {

            sb.AppendLine($"{indent}// [{index}] {step.StepRunnerKey} (disabled)");

            return;

        }



        sb.AppendLine($"{indent}// [{index}] {step.StepRunnerKey}");

        if (!string.IsNullOrWhiteSpace(step.Note))

        {

            sb.AppendLine($"{indent}// note: {step.Note}");

        }



        switch (step.StepRunnerKey)

        {

            case "sys:assign":

                EmitAssign(sb, step, indent);

                break;

            case "sys:evalexpression":

                EmitEvalExpression(sb, step, indent, "result");

                break;

            case "sys:compute":

                EmitEvalExpression(sb, step, indent, "output");

                break;

            case "sys:if":

            case "sys:simpleIf":

                EmitIf(sb, step, indent);

                break;

            case "sys:delay":

                EmitDelay(sb, step, indent);

                break;

            case "sys:readFile":

                EmitReadFile(sb, step, indent);

                break;

            case "sys:WriteTextFile":

                EmitWriteTextFile(sb, step, indent);

                break;

            case "sys:splitString":

                EmitSplitString(sb, step, indent);

                break;

            case "sys:group":

                EmitGroup(sb, step, indent);

                break;

            case "sys:each":

                EmitEach(sb, step, indent);

                break;

            case "sys:repeat":

                EmitRepeat(sb, step, indent);

                break;

            case "sys:subprogram":

                EmitSubProgram(sb, step, indent);

                break;

            default:

                EmitExecuteStepFallback(sb, step, indent);

                break;

        }



        sb.AppendLine();

    }



    private static void EmitAssign(StringBuilder sb, ActionStep step, string indent)

    {

        var outputVar = ReadOutputVar(step, "output");

        sb.AppendLine($"{indent}ctx.SetVar({Literal(outputVar)}, {FormatInputExpr(step, "input")});");

    }



    private static void EmitEvalExpression(

        StringBuilder sb,

        ActionStep step,

        string indent,

        string outputParam)

    {

        var outputVar = ReadOutputVar(step, outputParam);

        var temp = $"_{SanitizeIdent(step.StepRunnerKey)}_{outputParam}";

        sb.AppendLine(

            $"{indent}var {temp} = ctx.EvalExpression({FormatInputExpr(step, "expression")}, useVariables: true);");

        sb.AppendLine($"{indent}ctx.SetVar({Literal(outputVar)}, {temp});");

    }



    private static void EmitIf(StringBuilder sb, ActionStep step, string indent)

    {

        sb.AppendLine($"{indent}if (ctx.EvalCondition({FormatInputExpr(step, "condition")}))");

        sb.AppendLine($"{indent}{{");

        if (step.IfSteps is { Count: > 0 })

        {

            EmitSteps(sb, step.IfSteps, indent + "    ");

        }

        else

        {

            sb.AppendLine($"{indent}    // (empty ifSteps)");

        }



        sb.AppendLine($"{indent}}}");

        sb.AppendLine($"{indent}else");

        sb.AppendLine($"{indent}{{");

        if (step.ElseSteps is { Count: > 0 })

        {

            EmitSteps(sb, step.ElseSteps, indent + "    ");

        }

        else

        {

            sb.AppendLine($"{indent}    // (empty elseSteps)");

        }



        sb.AppendLine($"{indent}}}");

    }



    private static void EmitDelay(StringBuilder sb, ActionStep step, string indent)

    {

        var ms = step.DelayMs > 0

            ? step.DelayMs.ToString()

            : FormatInputExpr(step, "milliseconds", "delayMs", "delay");

        sb.AppendLine($"{indent}ctx.Delay(TimeSpan.FromMilliseconds({ms}));");

    }



    private static void EmitReadFile(StringBuilder sb, ActionStep step, string indent)

    {

        var path = FormatInputExpr(step, "path");

        var outputVar = ReadOutputVar(step, "txt");

        sb.AppendLine($"{indent}var _read_txt = System.IO.File.ReadAllText({path});");

        sb.AppendLine($"{indent}ctx.SetVar({Literal(outputVar)}, _read_txt);");

    }



    private static void EmitWriteTextFile(StringBuilder sb, ActionStep step, string indent)

    {

        var path = FormatInputExpr(step, "filePath", "path");

        var content = FormatInputExpr(step, "content");

        sb.AppendLine($"{indent}System.IO.File.WriteAllText({path}, {content}?.ToString() ?? \"\");");

    }



    private static void EmitSplitString(StringBuilder sb, ActionStep step, string indent)

    {

        var data = FormatInputExpr(step, "data");

        var separator = FormatInputExpr(step, "separator");

        var outputVar = ReadOutputVar(step, "output");

        sb.AppendLine($"{indent}var _split = ({data}?.ToString() ?? \"\").Split({separator}?.ToString() ?? \",\");");

        sb.AppendLine($"{indent}ctx.SetVar({Literal(outputVar)}, _split);");

    }



    private static void EmitGroup(StringBuilder sb, ActionStep step, string indent)

    {

        sb.AppendLine($"{indent}{{");

        EmitSteps(sb, step.IfSteps ?? [], indent + "    ");

        sb.AppendLine($"{indent}}}");

    }



    private static void EmitEach(StringBuilder sb, ActionStep step, string indent)

    {

        var input = FormatInputExpr(step, "input");

        var itemVar = ReadOutputVar(step, "item");

        sb.AppendLine($"{indent}foreach (var _each_item in (System.Collections.IEnumerable){input}!)");

        sb.AppendLine($"{indent}{{");

        sb.AppendLine($"{indent}    ctx.SetVar({Literal(itemVar)}, _each_item);");

        EmitSteps(sb, step.IfSteps ?? [], indent + "    ");

        sb.AppendLine($"{indent}}}");

    }



    private static void EmitRepeat(StringBuilder sb, ActionStep step, string indent)

    {

        var count = FormatInputExpr(step, "count");

        sb.AppendLine($"{indent}for (var _i = 0; _i < (long)({count} ?? 0); _i++)");

        sb.AppendLine($"{indent}{{");

        sb.AppendLine($"{indent}    ctx.SetVar(\"count\", _i);");

        EmitSteps(sb, step.IfSteps ?? [], indent + "    ");

        sb.AppendLine($"{indent}}}");

    }



    private static void EmitSubProgram(StringBuilder sb, ActionStep step, string indent)
    {
        var name = FormatInputExpr(step, "subProgram");
        var varInputs = step.InputParams
            .Where(kv => kv.Key.StartsWith("var:", StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (varInputs.Count == 0)
        {
            sb.AppendLine($"{indent}ctx.RunSp({name}?.ToString() ?? \"\");");
            return;
        }

        sb.AppendLine($"{indent}ctx.RunSp(");
        sb.AppendLine($"{indent}    {name}?.ToString() ?? \"\",");
        sb.AppendLine($"{indent}    new Dictionary<string, object>");
        sb.AppendLine($"{indent}    {{");
        foreach (var pair in varInputs)
        {
            var spVarName = pair.Key.Length > 4 ? pair.Key.Substring(4) : pair.Key;
            sb.AppendLine(
                $"{indent}        [{Literal(spVarName)}] = {FormatParamValue(pair.Value)},");
        }

        sb.AppendLine($"{indent}    }});");
    }



    private static void EmitExecuteStepFallback(StringBuilder sb, ActionStep step, string indent)

    {

        sb.AppendLine($"{indent}ctx.ExecuteStep(");

        sb.AppendLine($"{indent}    {Literal(step.StepRunnerKey)},");

        EmitInputParamsDictionary(sb, step, indent);

        EmitOutputParamsDictionary(sb, step, indent);

        sb.AppendLine($"{indent});");

    }



    private static void EmitInputParamsDictionary(StringBuilder sb, ActionStep step, string indent)

    {

        if (step.InputParams.Count == 0)

        {

            sb.AppendLine($"{indent}    new Dictionary<string, object>(),");

            return;

        }



        sb.AppendLine($"{indent}    new Dictionary<string, object>");

        sb.AppendLine($"{indent}    {{");

        foreach (var pair in step.InputParams)

        {

            sb.AppendLine(

                $"{indent}        [{Literal(pair.Key)}] = {FormatParamValue(pair.Value)},");

        }



        sb.AppendLine($"{indent}    }},");

    }



    private static void EmitOutputParamsDictionary(StringBuilder sb, ActionStep step, string indent)

    {

        if (step.OutputParams.Count == 0)

        {

            sb.AppendLine($"{indent}    new Dictionary<string, string>());");

            return;

        }



        sb.AppendLine($"{indent}    new Dictionary<string, string>");

        sb.AppendLine($"{indent}    {{");

        foreach (var pair in step.OutputParams)

        {

            sb.AppendLine(

                $"{indent}        [{Literal(pair.Key)}] = {Literal(pair.Value)},");

        }



        sb.AppendLine($"{indent}    }});");

    }



    private static string FormatInputExpr(ActionStep step, params string[] keys)

    {

        foreach (var key in keys)

        {

            if (!step.InputParams.TryGetValue(key, out var param) || param is null)

            {

                continue;

            }



            if (!string.IsNullOrWhiteSpace(param.VarKey)

                || !string.IsNullOrWhiteSpace(param.Value))

            {

                return FormatParamValue(param);

            }

        }



        return "\"\"";

    }



    /// <summary>

    /// Map wire param to C# preview expression: var ref, interpolate ($$), eval ($=), or literal.

    /// </summary>

    private static string FormatParamValue(ActionStepParam param)

    {

        if (!string.IsNullOrWhiteSpace(param.VarKey))

        {

            return $"ctx.GetVar({Literal(param.VarKey)})";

        }



        var value = param.Value ?? string.Empty;

        if (string.IsNullOrWhiteSpace(value))

        {

            return "\"\"";

        }



        if (value.StartsWith("$$", StringComparison.Ordinal))

        {

            return $"ctx.Interpolate({Literal(value)})";

        }



        if (value.StartsWith("$=", StringComparison.Ordinal))

        {

            return $"ctx.EvalExpression({Literal(value)}, useVariables: true)";

        }



        return Literal(value);

    }



    private static string ReadOutputVar(ActionStep step, string outputKey)

    {

        if (step.OutputParams.TryGetValue(outputKey, out var varKey)

            && !string.IsNullOrWhiteSpace(varKey))

        {

            return varKey;

        }



        return outputKey;

    }



    private static string Literal(string? value) =>

        value is null ? "null" : $"\"{EscapeString(value)}\"";



    private static string EscapeString(string value) =>

        value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");



    private static string SanitizeIdent(string key) =>

        key.Replace(":", "_").Replace("-", "_");

}


