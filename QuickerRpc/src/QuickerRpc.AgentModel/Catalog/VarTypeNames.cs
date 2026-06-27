using System.Globalization;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Maps Quicker VarType underlying int codes to stable English labels for agent payloads.</summary>
public static class VarTypeNames
{
    public static string Format(int v) =>
        v switch
        {
            0 => "Text",
            1 => "Number",
            2 => "Boolean",
            3 => "Image",
            4 => "List",
            6 => "DateTime",
            7 => "Keyboard",
            8 => "Mouse",
            9 => "Enum",
            10 => "Dict",
            11 => "Form",
            12 => "Integer",
            13 => "Table",
            14 => "FormForDict",
            98 => "Object",
            99 => "Any",
            100 => "NA",
            101 => "CreateVar",
            _ => "Unknown(" + v.ToString(CultureInfo.InvariantCulture) + ")"
        };
}
