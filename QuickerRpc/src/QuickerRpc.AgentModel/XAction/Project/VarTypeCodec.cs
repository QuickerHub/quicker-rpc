using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// Parses agent/workspace variable type tokens (numeric Quicker codes or shorthand names like <c>int</c>).
/// </summary>
public static class VarTypeCodec
{
    public const int Text = 0;
    public const int Number = 1;
    public const int Boolean = 2;
    public const int Image = 3;
    public const int List = 4;
    public const int DateTime = 6;
    public const int Enum = 9;
    public const int Dict = 10;
    public const int Integer = 12;
    public const int Table = 13;
    public const int Object = 98;
    public const int Any = 99;

    public static bool TryParse(JToken? token, out int varType)
    {
        varType = Text;
        if (token is null || token.Type == JTokenType.Null)
        {
            return false;
        }

        switch (token.Type)
        {
            case JTokenType.Integer:
                varType = token.Value<int>();
                return true;
            case JTokenType.String:
                var raw = token.Value<string>()?.Trim() ?? string.Empty;
                if (int.TryParse(raw, out varType))
                {
                    return true;
                }

                return TryParseName(raw, out varType);
            default:
                return false;
        }
    }

    public static JValue ToNativeTypeJValue(JToken? token)
    {
        if (token is null)
        {
            return new JValue(Text);
        }

        if (token.Type == JTokenType.Integer)
        {
            return new JValue(token.Value<int>());
        }

        if (TryParse(token, out var parsed))
        {
            return new JValue(parsed);
        }

        return new JValue(Text);
    }

    private static bool TryParseName(string raw, out int varType)
    {
        switch (raw.ToLowerInvariant())
        {
            case "text":
            case "string":
                return Assign(Text, out varType);
            case "number":
            case "double":
            case "float":
            case "decimal":
                return Assign(Number, out varType);
            case "boolean":
            case "bool":
                return Assign(Boolean, out varType);
            case "image":
                return Assign(Image, out varType);
            case "list":
                return Assign(List, out varType);
            case "datetime":
                return Assign(DateTime, out varType);
            case "enum":
                return Assign(Enum, out varType);
            case "dict":
                return Assign(Dict, out varType);
            case "integer":
            case "int":
                return Assign(Integer, out varType);
            case "table":
                return Assign(Table, out varType);
            case "any":
                return Assign(Any, out varType);
            case "object":
                return Assign(Object, out varType);
            default:
                varType = Text;
                return false;
        }
    }

    private static bool Assign(int value, out int varType)
    {
        varType = value;
        return true;
    }
}
