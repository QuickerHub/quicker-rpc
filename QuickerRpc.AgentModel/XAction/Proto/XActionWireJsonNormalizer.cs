using System.Linq;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Proto;

/// <summary>Converts agent/camelCase step and variable JSON arrays to PascalCase for x_action_program.proto JsonParser.</summary>
internal static class XActionWireJsonNormalizer
{
    public static JArray ToNativeStepsArray(JArray steps)
    {
        var output = new JArray();
        foreach (var token in steps)
        {
            if (token is JObject step)
            {
                output.Add(ToNativeStepObject(step));
            }
            else
            {
                output.Add(token);
            }
        }

        return output;
    }

    public static JArray ToNativeVariablesArray(JArray variables)
    {
        var output = new JArray();
        foreach (var token in variables)
        {
            if (token is JObject variable)
            {
                output.Add(ToNativeVariableObject(variable));
            }
            else
            {
                output.Add(token);
            }
        }

        return output;
    }

    private static JObject ToNativeStepObject(JObject step)
    {
        var result = new JObject();
        CopyRename(result, step, "stepRunnerKey", "StepRunnerKey");
        CopyRename(result, step, "StepRunnerKey", "StepRunnerKey");
        CopyRename(result, step, "stepId", "StepId");
        CopyRename(result, step, "StepId", "StepId");
        CopyRename(result, step, "note", "Note");
        CopyRename(result, step, "Note", "Note");
        CopyRename(result, step, "disabled", "Disabled");
        CopyRename(result, step, "Disabled", "Disabled");
        CopyRename(result, step, "collapsed", "Collapsed");
        CopyRename(result, step, "Collapsed", "Collapsed");
        CopyRename(result, step, "delayMs", "DelayMs");
        CopyRename(result, step, "DelayMs", "DelayMs");

        if (step["inputParams"] is JObject inputParams || step["InputParams"] is JObject)
        {
            var src = (JObject)(step["InputParams"] ?? step["inputParams"]!);
            result["InputParams"] = ToNativeInputParamsObject(src);
        }

        if (step["outputParams"] is JObject outputParams || step["OutputParams"] is JObject)
        {
            var src = (JObject)(step["OutputParams"] ?? step["outputParams"]!);
            result["OutputParams"] = ToNativeOutputParamsObject(src);
        }

        if (step["ifSteps"] is JArray ifSteps || step["IfSteps"] is JArray)
        {
            result["IfSteps"] = ToNativeStepsArray((JArray)(step["IfSteps"] ?? step["ifSteps"]!));
        }

        if (step["elseSteps"] is JArray elseSteps || step["ElseSteps"] is JArray)
        {
            result["ElseSteps"] = ToNativeStepsArray((JArray)(step["ElseSteps"] ?? step["elseSteps"]!));
        }

        return result;
    }

    private static JObject ToNativeInputParamsObject(JObject inputParams)
    {
        var result = new JObject();
        foreach (var prop in inputParams.Properties())
        {
            if (prop.Value is JObject param)
            {
                result[prop.Name] = ToNativeParamObject(param);
            }
        }

        return result;
    }

    private static JObject ToNativeParamObject(JObject param)
    {
        var result = new JObject();
        CopyRename(result, param, "varKey", "VarKey");
        CopyRename(result, param, "VarKey", "VarKey");
        CopyRename(result, param, "value", "Value");
        CopyRename(result, param, "Value", "Value");
        return result;
    }

    private static JObject ToNativeOutputParamsObject(JObject outputParams)
    {
        var result = new JObject();
        foreach (var prop in outputParams.Properties())
        {
            result[prop.Name] = prop.Value?.Type == JTokenType.String
                ? prop.Value
                : new JValue(prop.Value?.ToString() ?? string.Empty);
        }

        return result;
    }

    private static JObject ToNativeVariableObject(JObject variable)
    {
        var result = new JObject();
        CopyRename(result, variable, "id", "Id");
        CopyRename(result, variable, "Id", "Id");
        CopyRename(result, variable, "key", "Key");
        CopyRename(result, variable, "Key", "Key");
        CopyRename(result, variable, "desc", "Desc");
        CopyRename(result, variable, "Desc", "Desc");
        CopyRename(result, variable, "defaultValue", "DefaultValue");
        CopyRename(result, variable, "DefaultValue", "DefaultValue");
        CopyRename(result, variable, "isLocked", "IsLocked");
        CopyRename(result, variable, "IsLocked", "IsLocked");
        CopyRename(result, variable, "saveState", "SaveState");
        CopyRename(result, variable, "SaveState", "SaveState");
        CopyRename(result, variable, "isInput", "IsInput");
        CopyRename(result, variable, "IsInput", "IsInput");
        CopyRename(result, variable, "isOutput", "IsOutput");
        CopyRename(result, variable, "IsOutput", "IsOutput");
        CopyRename(result, variable, "paramName", "ParamName");
        CopyRename(result, variable, "ParamName", "ParamName");
        CopyRename(result, variable, "group", "Group");
        CopyRename(result, variable, "Group", "Group");
        CopyRename(result, variable, "customType", "CustomType");
        CopyRename(result, variable, "CustomType", "CustomType");

        if (variable["type"] != null)
        {
            result["Type"] = variable["type"]!;
        }
        else if (variable["Type"] != null)
        {
            result["Type"] = variable["Type"]!;
        }
        else if (variable["varType"] != null || variable["VarType"] != null)
        {
            var varTypeToken = variable["varType"] ?? variable["VarType"];
            if (varTypeToken!.Type == JTokenType.Integer)
            {
                result["Type"] = varTypeToken;
            }
            else
            {
                result["Type"] = MapVarTypeNameToInt(varTypeToken.ToString());
            }
        }

        CopyNestedObject(result, variable, "inputParamInfo", "InputParamInfo");
        CopyNestedObject(result, variable, "outputParamInfo", "OutputParamInfo");
        CopyNestedObject(result, variable, "tableDef", "TableDef");

        return result;
    }

    private static void CopyNestedObject(JObject result, JObject source, string camel, string pascal)
    {
        if (source[camel] is JObject camelObj)
        {
            result[pascal] = camelObj;
        }
        else if (source[pascal] is JObject pascalObj)
        {
            result[pascal] = pascalObj;
        }
    }

    private static void CopyRename(JObject target, JObject source, string from, string to)
    {
        if (source[from] != null && target[to] == null)
        {
            target[to] = source[from];
        }
    }

    private static JValue MapVarTypeNameToInt(string? name)
    {
        return (name ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            "number" => new JValue(1),
            "boolean" => new JValue(2),
            "image" => new JValue(3),
            "list" => new JValue(4),
            "datetime" => new JValue(6),
            "enum" => new JValue(9),
            "dict" => new JValue(10),
            "integer" => new JValue(12),
            "table" => new JValue(13),
            _ => new JValue(0),
        };
    }
}
